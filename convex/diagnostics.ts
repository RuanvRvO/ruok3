import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Diagnostic query to see current user's state
export const debugCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return { error: "Not authenticated" };
    }

    const user = await ctx.db.get(userId);

    if (!user) {
      return { error: "User not found" };
    }

    // Get all memberships for this user
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get all organizations in the system
    const allMemberships = await ctx.db
      .query("organizationMemberships")
      .collect();

    // Group by organization to see all orgs
    const orgSet = new Set(allMemberships.map(m => m.organisation));
    const allOrgs = Array.from(orgSet);

    return {
      currentUser: {
        _id: userId,
        email: user.email,
        name: user.name,
        surname: user.surname,
      },
      myMemberships: memberships.map(m => ({
        _id: m._id,
        organisation: m.organisation,
        role: m.role,
      })),
      allOrganizationsInSystem: allOrgs,
      totalMembershipsInSystem: allMemberships.length,
    };
  },
});

// Query to see all memberships for a specific organization
export const debugOrganization = query({
  args: {
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.organisation))
      .collect();

    const membershipsWithUsers = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          membershipId: m._id,
          userId: m.userId,
          userEmail: user?.email || "DELETED USER",
          userName: user?.name,
          role: m.role,
        };
      })
    );

    return {
      organisation: args.organisation,
      memberships: membershipsWithUsers,
    };
  },
});

// Mutation to fix a specific user's access to an organization
export const fixUserAccess = mutation({
  args: {
    userEmail: v.string(),
    organisation: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    // Only allow authenticated users to run this
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      throw new Error("Not authenticated");
    }

    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail.toLowerCase().trim()))
      .first();

    if (!user) {
      throw new Error(`No user found with email: ${args.userEmail}`);
    }

    // Check if membership already exists
    const existingMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", user._id).eq("organisation", args.organisation)
      )
      .first();

    if (existingMembership) {
      // Update existing membership
      await ctx.db.patch(existingMembership._id, {
        role: args.role,
      });
      return {
        success: true,
        action: "updated",
        message: `Updated ${args.userEmail}'s role to ${args.role} in ${args.organisation}`,
      };
    } else {
      // Create new membership
      await ctx.db.insert("organizationMemberships", {
        userId: user._id,
        organisation: args.organisation,
        role: args.role,
        createdAt: Date.now(),
      });
      return {
        success: true,
        action: "created",
        message: `Created ${args.role} membership for ${args.userEmail} in ${args.organisation}`,
      };
    }
  },
});

// Mutation to delete a specific membership
export const deleteMembership = mutation({
  args: {
    membershipId: v.id("organizationMemberships"),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      throw new Error("Not authenticated");
    }

    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new Error("Membership not found");
    }

    await ctx.db.delete(args.membershipId);

    return {
      success: true,
      message: `Deleted membership for organization: ${membership.organisation}`,
    };
  },
});
