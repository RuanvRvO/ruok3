import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
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

    // Debug log to check if organisation is present
    console.log("Current user data:", {
      id: user?._id,
      email: user?.email,
      name: user?.name,
      organisation: user?.organisation,
    });

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

// Query to list all managers for the current user's organization
export const listManagers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    const user = await ctx.db.get(userId);
    const organisation = user?.organisation;
    if (!organisation) {
      return [];
    }

    // Get all users with the same organisation
    const allUsers = await ctx.db.query("users").collect();
    const managers = allUsers.filter((u) => u.organisation === organisation);

    return managers.map((manager) => ({
      _id: manager._id,
      name: manager.name || manager.email,
      email: manager.email,
    }));
  },
});

// Mutation to add a new manager to the organization
export const addManager = mutation({
  args: {
    email: v.string(),
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
      throw new Error("No organization found");
    }

    // Check if user with this email already exists
    const allUsers = await ctx.db.query("users").collect();
    const existingUser = allUsers.find((u) => u.email === args.email);

    if (existingUser) {
      // User exists - check if they already have access to this org
      if (existingUser.organisation === organisation) {
        throw new Error("This user already has access to your organization");
      }
      // Update their organization to match
      await ctx.db.patch(existingUser._id, {
        organisation: organisation,
      });
      return existingUser._id;
    }

    // Create a new user (they will complete signup when they receive the invitation)
    // Note: In a real implementation, you'd want to send an invitation email here
    const newUserId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      organisation: organisation,
      emailVerificationTime: undefined,
      isAnonymous: false,
    });

    return newUserId;
  },
});

// Mutation to remove a manager from the organization
export const removeManager = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (currentUserId === null) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db.get(currentUserId);
    const organisation = currentUser?.organisation;
    if (!organisation) {
      throw new Error("No organization found");
    }

    // Get the user to be removed
    const userToRemove = await ctx.db.get(args.userId);
    if (!userToRemove) {
      throw new Error("User not found");
    }

    // Verify they are in the same organization
    if (userToRemove.organisation !== organisation) {
      throw new Error("User is not in your organization");
    }

    // Don't allow removing yourself
    if (args.userId === currentUserId) {
      throw new Error("You cannot remove yourself");
    }

    // Remove the organization from the user (or delete them if they were only invited)
    await ctx.db.patch(args.userId, {
      organisation: undefined,
    });

    return { success: true };
  },
});

// Mutation to update user account details
export const updateAccount = mutation({
  args: {
    name: v.string(),
    surname: v.string(),
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Update the user's account details
    await ctx.db.patch(userId, {
      name: args.name,
      surname: args.surname,
      organisation: args.organisation,
    });

    return { success: true };
  },
});
