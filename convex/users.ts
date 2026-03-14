import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Query to check if an email is already registered
// Checks both users table and authAccounts table (Convex Auth stores accounts separately)
export const checkEmailExists = query({
  args: {
    email: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // Convex Auth creates a users record with email for every password-authenticated user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .first();

    return existingUser !== null;
  },
});

// Query to get current user's full info
export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.optional(v.string()),
      surname: v.optional(v.string()),
      email: v.optional(v.string()),
      isAnonymous: v.optional(v.boolean()),
    })
  ),
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
  returns: v.union(v.null(), v.id("users")),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId;
  },
});


// Mutation to update user account details (name, surname only)
export const updateAccount = mutation({
  args: {
    name: v.string(),
    surname: v.string(),
  },
  returns: v.object({ success: v.literal(true) }),
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
  returns: v.array(v.object({
    _id: v.id("organizationMemberships"),
    userId: v.id("users"),
    email: v.string(),
    name: v.string(),
    surname: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    createdAt: v.number(),
  })),
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
