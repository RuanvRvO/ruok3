import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Simple password hashing function (in production, use a proper library)
async function hashPassword(password: string): Promise<string> {
  // Using Web Crypto API which is available in Convex
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Create a viewer account
export const createViewer = mutation({
  args: {
    name: v.string(),
    surname: v.string(),
    email: v.string(),
    password: v.string(),
    organisation: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    // Check if viewer with this email already exists
    const existingViewer = await ctx.db
      .query("viewers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingViewer) {
      throw new Error("A viewer account with this email already exists");
    }

    // Hash the password
    const hashedPassword = await hashPassword(args.password);

    // Create the viewer account
    const viewerId = await ctx.db.insert("viewers", {
      name: args.name,
      surname: args.surname,
      email: args.email,
      password: hashedPassword,
      organisation: args.organisation,
      role: args.role,
      createdAt: Date.now(),
    });

    return { viewerId };
  },
});

// Sign in a viewer
export const signInViewer = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    // Find viewer by email
    const viewer = await ctx.db
      .query("viewers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!viewer) {
      throw new Error("Invalid email or password");
    }

    // Hash the provided password and compare
    const hashedPassword = await hashPassword(args.password);

    if (hashedPassword !== viewer.password) {
      throw new Error("Invalid email or password");
    }

    // Return viewer info (password excluded)
    return {
      _id: viewer._id,
      name: viewer.name,
      surname: viewer.surname,
      email: viewer.email,
      organisation: viewer.organisation,
      role: viewer.role,
    };
  },
});

// Get current viewer by ID
export const getViewerById = query({
  args: {
    viewerId: v.id("viewers"),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db.get(args.viewerId);

    if (!viewer) {
      return null;
    }

    // Return viewer info without password
    return {
      _id: viewer._id,
      name: viewer.name,
      surname: viewer.surname,
      email: viewer.email,
      organisation: viewer.organisation,
      role: viewer.role,
    };
  },
});

// List all viewers for an organization (for admins)
export const listViewers = query({
  args: {
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const viewers = await ctx.db
      .query("viewers")
      .withIndex("by_organisation", (q) => q.eq("organisation", args.organisation))
      .collect();

    // Return viewer info without passwords
    return viewers.map(v => ({
      _id: v._id,
      name: v.name,
      surname: v.surname,
      email: v.email,
      organisation: v.organisation,
      role: v.role,
      createdAt: v.createdAt,
    }));
  },
});

// Remove a viewer (for admins)
export const removeViewer = mutation({
  args: {
    viewerId: v.id("viewers"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.viewerId);
    return { success: true };
  },
});
