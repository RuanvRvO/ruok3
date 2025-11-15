import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Query to get all groups for the manager's organization
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    const organisation = user?.organisation;

    if (!organisation) {
      return [];
    }

    const groups = await ctx.db
      .query("groups")
      .withIndex("by_organisation", (q) =>
        q.eq("organisation", organisation)
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

    const members = await Promise.all(
      memberships.map(async (membership) => {
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    const organisation = user?.organisation;

    if (!organisation) {
      throw new Error("User does not belong to an organization");
    }

    const groupId = await ctx.db.insert("groups", {
      name: args.name,
      organisation: organisation,
      createdAt: Date.now(),
    });

    return groupId;
  },
});

// Mutation to remove a group
export const remove = mutation({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    const group = await ctx.db.get(args.groupId);

    if (!group) {
      throw new Error("Group not found");
    }

    // Verify the group belongs to the same organization
    if (group.organisation !== user?.organisation) {
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    const group = await ctx.db.get(args.groupId);
    const employee = await ctx.db.get(args.employeeId);

    if (!group || !employee) {
      throw new Error("Group or employee not found");
    }

    // Verify both belong to the same organization
    if (
      group.organisation !== user?.organisation ||
      employee.organisation !== user?.organisation
    ) {
      throw new Error("Not authorized");
    }

    // Check if already a member
    const existing = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_employee", (q) =>
        q.eq("groupId", args.groupId).eq("employeeId", args.employeeId)
      )
      .first();

    if (existing) {
      throw new Error("Employee is already a member of this group");
    }

    const membershipId = await ctx.db.insert("groupMembers", {
      groupId: args.groupId,
      employeeId: args.employeeId,
    });

    return membershipId;
  },
});

// Mutation to remove an employee from a group
export const removeMember = mutation({
  args: {
    membershipId: v.id("groupMembers"),
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

    const group = await ctx.db.get(membership.groupId);
    const user = await ctx.db.get(userId);

    // Verify the group belongs to the same organization
    if (group?.organisation !== user?.organisation) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.membershipId);
  },
});
