import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Query to get all employees for an organization
export const list = query({
  args: {
    organisation: v.string(),
  },
  returns: v.array(v.object({
    _id: v.id("employees"),
    _creationTime: v.number(),
    firstName: v.string(),
    email: v.string(),
    organisation: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })),
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

    const employees = await ctx.db
      .query("employees")
      .withIndex("by_organisation", (q) =>
        q.eq("organisation", args.organisation)
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
    organisation: v.string(),
  },
  returns: v.union(
    v.object({ success: v.literal(false), error: v.string() }),
    v.object({ success: v.literal(true), employeeId: v.id("employees") })
  ),
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
      throw new Error("You don't have permission to add employees");
    }

    const organisation = args.organisation;

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
      return { success: false as const, error: "This employee is already added" };
    }

    const employeeId = await ctx.db.insert("employees", {
      firstName: args.firstName,
      email: args.email,
      organisation: organisation,
      createdAt: Date.now(),
    });

    return { success: true as const, employeeId };
  },
});

// Mutation to remove an employee
export const remove = mutation({
  args: {
    employeeId: v.id("employees"),
    organisation: v.string(),
  },
  returns: v.null(),
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
      throw new Error("You don't have permission to remove employees");
    }

    const employee = await ctx.db.get(args.employeeId);

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify the employee belongs to this organization
    if (employee.organisation !== args.organisation) {
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

    return null;
  },
});

// Internal query to get all employees (for sending emails)
export const listAll = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("employees"),
    _creationTime: v.number(),
    firstName: v.string(),
    email: v.string(),
    organisation: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })),
  handler: async (ctx) => {
    const allEmployees = await ctx.db.query("employees").collect();
    // Filter out soft-deleted employees
    return allEmployees.filter(emp => !emp.deletedAt);
  },
});
