import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Query to get all employees for the manager's organization
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

    const employees = await ctx.db
      .query("employees")
      .withIndex("by_organisation", (q) =>
        q.eq("organisation", organisation)
      )
      .order("desc")
      .collect();

    return employees;
  },
});

// Mutation to add an employee
export const add = mutation({
  args: {
    firstName: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user?.organisation) {
      throw new Error("User does not belong to an organization");
    }

    const employeeId = await ctx.db.insert("employees", {
      firstName: args.firstName,
      email: args.email,
      organisation: user.organisation,
      createdAt: Date.now(),
    });

    return employeeId;
  },
});

// Mutation to remove an employee
export const remove = mutation({
  args: {
    employeeId: v.id("employees"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    const employee = await ctx.db.get(args.employeeId);

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify the employee belongs to the same organization
    if (employee.organisation !== user?.organisation) {
      throw new Error("Not authorized to remove this employee");
    }

    // Remove employee from all groups first
    const groupMemberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();

    for (const membership of groupMemberships) {
      await ctx.db.delete(membership._id);
    }

    // Now delete the employee
    await ctx.db.delete(args.employeeId);
  },
});
