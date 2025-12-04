import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
const schema = defineSchema({
  ...authTables,
  // Users table - authentication only (no organization field)
  users: defineTable({
    name: v.optional(v.string()),
    surname: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  }).index("email", ["email"]),
  // Organization memberships - links users to organizations with roles
  organizationMemberships: defineTable({
    userId: v.id("users"),
    organisation: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_organisation", ["organisation"])
    .index("by_user_and_org", ["userId", "organisation"]),
  managerInvitations: defineTable({
    email: v.string(),
    organisation: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    invitedBy: v.id("users"),
    token: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("expired")),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_token", ["token"])
    .index("by_organisation", ["organisation"]),
  employees: defineTable({
    firstName: v.string(),
    email: v.string(),
    organisation: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_organisation", ["organisation"]),
  groups: defineTable({
    name: v.string(),
    organisation: v.string(),
    createdAt: v.number(),
  }).index("by_organisation", ["organisation"]),
  groupMembers: defineTable({
    groupId: v.id("groups"),
    employeeId: v.id("employees"),
    createdAt: v.optional(v.number()), // Track when employee joined the group
    removedAt: v.optional(v.number()), // Track when employee was removed from the group
  })
    .index("by_group", ["groupId"])
    .index("by_employee", ["employeeId"])
    .index("by_group_and_employee", ["groupId", "employeeId"]),
  moodCheckins: defineTable({
    employeeId: v.id("employees"),
    organisation: v.string(),
    mood: v.union(v.literal("green"), v.literal("amber"), v.literal("red")),
    note: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    timestamp: v.number(),
    date: v.string(), // YYYY-MM-DD format for easy querying
  })
    .index("by_employee", ["employeeId"])
    .index("by_organisation", ["organisation"])
    .index("by_date", ["date"])
    .index("by_organisation_and_date", ["organisation", "date"]),
});

export default schema;
