import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Query to check if an email is already registered
export const checkEmailExists = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const allUsers = await ctx.db.query("users").collect();
    const existingUser = allUsers.find((u) => u.email === args.email);

    return existingUser !== undefined;
  },
});

// Query to get current user's full info
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);
    return user;
  },
});

// Debug query to see all users with a specific email
export const debugUsersByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email))
      .collect();

    return users.map((user) => ({
      id: user._id,
      email: user.email,
      organisation: user.organisation,
      name: user.name,
    }));
  },
});
