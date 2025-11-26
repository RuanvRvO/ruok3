import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
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

    // Filter out soft-deleted employees
    return employees.filter(emp => !emp.deletedAt);
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

    const organisation = user.organisation;

    // Check if an employee with the same email already exists in this organization
    const existingEmployees = await ctx.db
      .query("employees")
      .withIndex("by_organisation", (q) =>
        q.eq("organisation", organisation)
      )
      .collect();

    const duplicateEmployee = existingEmployees.find(
      emp => emp.email.toLowerCase() === args.email.toLowerCase() &&
             emp.firstName.toLowerCase() === args.firstName.toLowerCase() &&
             !emp.deletedAt // Only check active employees
    );

    if (duplicateEmployee) {
      return { success: false, error: "This employee is already added" };
    }

    const employeeId = await ctx.db.insert("employees", {
      firstName: args.firstName,
      email: args.email,
      organisation: organisation,
      createdAt: Date.now(),
    });

    return { success: true, employeeId };
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

    // Remove employee from all groups first (soft delete memberships)
    const groupMemberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();

    for (const membership of groupMemberships) {
      // Only remove if not already removed
      if (!membership.removedAt) {
        await ctx.db.patch(membership._id, {
          removedAt: Date.now(),
        });
      }
    }

    // Soft delete the employee (mark as deleted instead of removing from database)
    await ctx.db.patch(args.employeeId, {
      deletedAt: Date.now(),
    });
  },
});

// Internal query to get all employees (for sending emails)
export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allEmployees = await ctx.db.query("employees").collect();
    // Filter out soft-deleted employees
    return allEmployees.filter(emp => !emp.deletedAt);
  },
});
