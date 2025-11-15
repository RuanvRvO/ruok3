import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  // Extend the users table to include custom profile fields
  users: defineTable({
    name: v.optional(v.string()),
    surname: v.optional(v.string()),
    organisation: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
  }),
  numbers: defineTable({
    value: v.number(),
  }),
  employees: defineTable({
    firstName: v.string(),
    email: v.string(),
    organisation: v.string(),
    createdAt: v.number(),
  }).index("by_organisation", ["organisation"]),
  groups: defineTable({
    name: v.string(),
    organisation: v.string(),
    createdAt: v.number(),
  }).index("by_organisation", ["organisation"]),
  groupMembers: defineTable({
    groupId: v.id("groups"),
    employeeId: v.id("employees"),
  })
    .index("by_group", ["groupId"])
    .index("by_employee", ["employeeId"])
    .index("by_group_and_employee", ["groupId", "employeeId"]),
});
