import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Create a new organization
export const createOrganization = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Check if organization name already exists
    const existingOrg = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organisation")
      .filter((q) => q.eq(q.field("organisation"), args.name))
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

// Get all members of an organization
export const getOrganizationMembers = query({
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

// Add a member to an organization (used when accepting invitations)
export const addOrganizationMember = mutation({
  args: {
    userId: v.id("users"),
    organisation: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    // Check if membership already exists
    const existingMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", args.userId).eq("organisation", args.organisation)
      )
      .first();

    if (existingMembership) {
      throw new Error("User is already a member of this organization");
    }

    // Create the membership
    const membershipId = await ctx.db.insert("organizationMemberships", {
      userId: args.userId,
      organisation: args.organisation,
      role: args.role,
      createdAt: Date.now(),
    });

    return { membershipId };
  },
});

// Remove a member from an organization
export const removeOrganizationMember = mutation({
  args: {
    membershipId: v.id("organizationMemberships"),
  },
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
      const owners = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organisation", (q) =>
          q.eq("organisation", membership.organisation)
        )
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();

      if (owners.length <= 1) {
        throw new Error("Cannot remove the last owner from the organization");
      }
    }

    await ctx.db.delete(args.membershipId);
    return { success: true };
  },
});

// Update organization name
export const updateOrganizationName = mutation({
  args: {
    oldName: v.string(),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Check if user is owner
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.oldName)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only organization owners can update the organization name");
    }

    // Check if new name already exists
    const existingOrg = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.newName))
      .first();

    if (existingOrg) {
      throw new Error("An organization with this name already exists");
    }

    // Update all memberships with the old org name
    const allMemberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.oldName))
      .collect();

    for (const m of allMemberships) {
      await ctx.db.patch(m._id, {
        organisation: args.newName,
      });
    }

    // Also update related tables (employees, groups, etc.)
    // Update employees
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.oldName))
      .collect();
    for (const emp of employees) {
      await ctx.db.patch(emp._id, { organisation: args.newName });
    }

    // Update groups
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.oldName))
      .collect();
    for (const group of groups) {
      await ctx.db.patch(group._id, { organisation: args.newName });
    }

    // Update mood checkins
    const checkins = await ctx.db
      .query("moodCheckins")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.oldName))
      .collect();
    for (const checkin of checkins) {
      await ctx.db.patch(checkin._id, { organisation: args.newName });
    }

    return { success: true };
  },
});

// Internal query to get organization members (for email notifications)
export const getOrganizationMembersInternal = internalQuery({
  args: {
    organisation: v.string(),
  },
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

