import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Query to check if an email is already registered
// Checks both users table and authAccounts table (Convex Auth stores accounts separately)
export const checkEmailExists = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Check users table first
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .first();

    if (existingUser) {
      return true;
    }

    // Also check authAccounts table (Convex Auth stores accounts here)
    // The email is stored in the account data
    const authAccounts = await ctx.db
      .query("authAccounts")
      .collect();

    // Check if any auth account has this email
    // Note: authAccounts structure may vary, but typically email is in account data
    for (const account of authAccounts) {
      // The account data structure depends on Convex Auth implementation
      // Typically email might be in account.email or account.profile.email
      const accountEmail = (account as any).email || (account as any).profile?.email;
      if (accountEmail && accountEmail.toLowerCase().trim() === args.email.toLowerCase().trim()) {
        return true;
      }
    }

    return false;
  },
});

// Query to get current user's full info
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    return user;
  },
});

// Query to get current user ID
export const getCurrentUserId = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId;
  },
});

// Query to check if current user needs email verification
// Returns true if user is new and hasn't verified email
// Returns false for existing users (grandfathered) or verified users
export const needsEmailVerification = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return false; // Not authenticated, no verification needed (redirect will happen elsewhere)
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return false;
    }

    // If user has emailVerificationTime, they're verified (or grandfathered if it's undefined/null for old users)
    // New users will have emailVerificationTime explicitly set to null/undefined when created
    // and will need to verify before it's set to a timestamp

    // Strategy for grandfathering:
    // - Existing users (created before this feature): emailVerificationTime is undefined -> allowed
    // - New users who just signed up: emailVerificationTime is undefined -> need to verify
    // - Verified users: emailVerificationTime is a number -> allowed

    // We'll use creation timestamp as a heuristic:
    // If user was created recently (within last hour) and has no verification time, they need to verify
    // If user is old and has no verification time, they're grandfathered

    const userCreatedAt = user._creationTime; // Convex automatically tracks this
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    // If email is already verified, no need to verify again
    if (user.emailVerificationTime) {
      return false;
    }

    // If user was created more than 1 hour ago and has no verification time,
    // they're an existing user - grandfather them in
    if (userCreatedAt < oneHourAgo) {
      return false;
    }

    // New user without verification - they need to verify
    return true;
  },
});

// Query to get user by email (for fixing orphaned memberships)
export const getUserByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .first();
    
    return user ? {
      _id: user._id,
      email: user.email,
      name: user.name,
      surname: user.surname,
    } : null;
  },
});

// Query to get user's role in current organization
export const getUserRoleInOrg = query({
  args: {
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    return membership?.role || null;
  },
});

// Mutation to update user account details (name, surname only)
export const updateAccount = mutation({
  args: {
    name: v.string(),
    surname: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Update the user's account details
    await ctx.db.patch(userId, {
      name: args.name,
      surname: args.surname,
    });

    return { success: true };
  },
});

// Query to get all members of an organization with their details
export const getOrganizationMembersWithDetails = query({
  args: {
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Check if user has access to this org
    const userMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!userMembership) {
      throw new Error("You don't have access to this organization");
    }

    // Get all memberships for this org
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.organisation))
      .collect();

    // Fetch user details for each member
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return {
          _id: membership._id,
          userId: membership.userId,
          email: user?.email || "",
          name: user?.name || "",
          surname: user?.surname || "",
          role: membership.role,
          createdAt: membership.createdAt,
        };
      })
    );

    return members;
  },
});
