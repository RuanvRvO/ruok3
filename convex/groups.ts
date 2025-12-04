import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Query to get all groups for an organization
export const list = query({
  args: {
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership) {
      throw new Error("You don't have access to this organization");
    }

    const groups = await ctx.db
      .query("groups")
      .withIndex("by_organisation", (q) =>
        q.eq("organisation", args.organisation)
      )
      .order("desc")
      .collect();

    return groups;
  },
});

// Query to get members of a specific group
export const getMembers = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    // Filter out removed memberships (soft-deleted)
    const activeMemberships = memberships.filter(m => !m.removedAt);

    const members = await Promise.all(
      activeMemberships.map(async (membership) => {
        const employee = await ctx.db.get(membership.employeeId);
        return {
          membershipId: membership._id,
          ...employee,
        };
      })
    );

    return members.filter((m) => m !== null);
  },
});

// Mutation to add a group
export const add = mutation({
  args: {
    name: v.string(),
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
      throw new Error("You don't have permission to add groups");
    }

    // Check if a group with the same name already exists in this organization
    const existingGroups = await ctx.db
      .query("groups")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.organisation))
      .collect();

    const duplicateGroup = existingGroups.find(
      group => group.name.toLowerCase() === args.name.toLowerCase()
    );

    if (duplicateGroup) {
      return { success: false, error: "This group name is already in use" };
    }

    const groupId = await ctx.db.insert("groups", {
      name: args.name,
      organisation: args.organisation,
      createdAt: Date.now(),
    });

    return { success: true, groupId };
  },
});

// Mutation to remove a group
export const remove = mutation({
  args: {
    groupId: v.id("groups"),
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
      throw new Error("You don't have permission to remove groups");
    }

    const group = await ctx.db.get(args.groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    // Verify the group belongs to this organization
    if (group.organisation !== args.organisation) {
      throw new Error("Not authorized to remove this group");
    }

    // Remove all group memberships first
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    // Remove the group
    await ctx.db.delete(args.groupId);
  },
});

// Mutation to add an employee to a group
export const addMember = mutation({
  args: {
    groupId: v.id("groups"),
    employeeId: v.id("employees"),
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
      throw new Error("You don't have permission to add members to groups");
    }

    const group = await ctx.db.get(args.groupId);
    const employee = await ctx.db.get(args.employeeId);

    if (!group || !employee) {
      throw new Error("Group or employee not found");
    }

    // Verify both belong to the organization
    if (
      group.organisation !== args.organisation ||
      employee.organisation !== args.organisation
    ) {
      throw new Error("Not authorized");
    }

    // Check if already an active member (not removed)
    const existing = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_employee", (q) =>
        q.eq("groupId", args.groupId).eq("employeeId", args.employeeId)
      )
      .filter((q) => q.eq(q.field("removedAt"), undefined))
      .first();

    if (existing) {
      throw new Error("Employee is already a member of this group");
    }

    // Create a new membership (even if they were previously removed, we create a new record)
    const membershipId = await ctx.db.insert("groupMembers", {
      groupId: args.groupId,
      employeeId: args.employeeId,
      createdAt: Date.now(),
    });

    return membershipId;
  },
});

// Mutation to remove an employee from a group
export const removeMember = mutation({
  args: {
    membershipId: v.id("groupMembers"),
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to this organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
      throw new Error("You don't have permission to remove members from groups");
    }

    const groupMembership = await ctx.db.get(args.membershipId);

    if (!groupMembership) {
      throw new Error("Membership not found");
    }

    const group = await ctx.db.get(groupMembership.groupId);

    // Verify the group belongs to the organization
    if (group?.organisation !== args.organisation) {
      throw new Error("Not authorized");
    }

    // Soft delete the membership (mark as removed instead of deleting)
    await ctx.db.patch(args.membershipId, {
      removedAt: Date.now(),
    });
  },
});
