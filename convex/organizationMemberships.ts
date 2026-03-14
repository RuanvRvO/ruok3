import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Create a new organization
export const createOrganization = mutation({
  args: {
    name: v.string(),
  },
  returns: v.object({ membershipId: v.id("organizationMemberships"), organisation: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Check if organization name already exists
    const existingOrg = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.name))
      .first();

    if (existingOrg) {
      throw new Error("An organization with this name already exists");
    }

    // Create organization membership with user as owner
    const membershipId = await ctx.db.insert("organizationMemberships", {
      userId: userId,
      organisation: args.name,
      role: "owner",
      createdAt: Date.now(),
    });

    return { membershipId, organisation: args.name };
  },
});

// Get all organizations for the current user
export const getUserOrganizations = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("organizationMemberships"),
    organisation: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    createdAt: v.number(),
  })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Query all memberships for this user using the index
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return memberships.map((m) => ({
      _id: m._id,
      organisation: m.organisation,
      role: m.role,
      createdAt: m.createdAt,
    }));
  },
});

// Get user's role in a specific organization
export const getUserRoleInOrg = query({
  args: {
    organisation: v.string(),
  },
  returns: v.union(v.null(), v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"))),
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

// Remove a member from an organization
export const removeOrganizationMember = mutation({
  args: {
    membershipId: v.id("organizationMemberships"),
  },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new Error("Membership not found");
    }

    // Check if current user is owner of the organization
    const userMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", membership.organisation)
      )
      .first();

    if (!userMembership || userMembership.role !== "owner") {
      throw new Error("Only organization owners can remove members");
    }

    // Don't allow owner to remove themselves if they're the only owner
    if (membership.userId === userId) {
      const allOrgMembers = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organisation", (q) =>
          q.eq("organisation", membership.organisation)
        )
        .collect();
      const owners = allOrgMembers.filter((m) => m.role === "owner");

      if (owners.length <= 1) {
        throw new Error("Cannot remove the last owner from the organization");
      }
    }

    await ctx.db.delete(args.membershipId);
    return { success: true as const };
  },
});

// Internal query to get organization members (for email notifications)
export const getOrganizationMembersInternal = internalQuery({
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
    // Get all members
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

