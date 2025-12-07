import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Query to check if an email is already registered
export const checkEmailExists = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    return existingUser !== undefined;
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
