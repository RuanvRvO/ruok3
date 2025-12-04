import { v } from "convex/values";
import { mutation, query, internalAction } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// Generate a random token for invitation
function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Mutation to create a manager invitation
export const createInvitation = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    organisation: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Check if user is owner of the organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only organization owners can invite members");
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await ctx.db
      .query("managerInvitations")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) =>
        q.and(
          q.eq(q.field("organisation"), args.organisation),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();

    if (existingInvitation) {
      throw new Error("An invitation has already been sent to this email");
    }

    // Check if user with this email already has access to the organization
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    if (existingUser) {
      const userMembership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user_and_org", (q) =>
          q.eq("userId", existingUser._id).eq("organisation", args.organisation)
        )
        .first();

      if (userMembership) {
        throw new Error("This user already has access to your organization");
      }
    }

    // Create the invitation
    const token = generateToken();
    const now = Date.now();
    const expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days

    const invitationId = await ctx.db.insert("managerInvitations", {
      email: args.email,
      organisation: args.organisation,
      role: args.role,
      invitedBy: userId,
      token,
      status: "pending",
      createdAt: now,
      expiresAt,
    });

    // Get user for email
    const user = await ctx.db.get(userId);

    // Schedule email sending
    await ctx.scheduler.runAfter(0, internal.managerInvitations.sendInvitationEmail, {
      email: args.email,
      organisation: args.organisation,
      role: args.role,
      token,
      inviterName: user?.name || user?.email || "Your organization",
    });

    return { invitationId, token };
  },
});

// Query to list all manager invitations (returns all, frontend filters by org)
export const listInvitations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Return all invitations - frontend will filter by selected org
    const invitations = await ctx.db
      .query("managerInvitations")
      .collect();

    return invitations;
  },
});

// Mutation to revoke/delete an invitation
export const revokeInvitation = mutation({
  args: {
    invitationId: v.id("managerInvitations"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    // Check if user is owner of the organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", invitation.organisation)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only organization owners can revoke invitations");
    }

    await ctx.db.delete(args.invitationId);

    return { success: true };
  },
});

// Query to get invitation by token
export const getInvitationByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("managerInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) {
      return null;
    }

    // Check if expired
    if (invitation.expiresAt < Date.now()) {
      return { ...invitation, isExpired: true };
    }

    return { ...invitation, isExpired: false };
  },
});

// Mutation to accept invitation and create user account
export const acceptInvitation = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("managerInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) {
      throw new Error("Invalid invitation token");
    }

    if (invitation.status !== "pending") {
      throw new Error("This invitation has already been used");
    }

    if (invitation.expiresAt < Date.now()) {
      await ctx.db.patch(invitation._id, { status: "expired" });
      throw new Error("This invitation has expired");
    }

    // Create organization membership for the user
    await ctx.db.insert("organizationMemberships", {
      userId: args.userId,
      organisation: invitation.organisation,
      role: invitation.role,
      createdAt: Date.now(),
    });

    // Mark invitation as accepted
    await ctx.db.patch(invitation._id, {
      status: "accepted",
    });

    return { success: true };
  },
});

// Mutation to accept invitation for existing users (creates viewer entry)
export const acceptInvitationForExistingUser = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.email) {
      throw new Error("User not found or invalid user data");
    }

    const invitation = await ctx.db
      .query("managerInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) {
      throw new Error("Invalid invitation token");
    }

    if (invitation.status !== "pending") {
      throw new Error("This invitation has already been used");
    }

    if (invitation.expiresAt < Date.now()) {
      await ctx.db.patch(invitation._id, { status: "expired" });
      throw new Error("This invitation has expired");
    }

    const userEmail = user.email; // TypeScript now knows this is definitely a string

    // Verify the invitation email matches the authenticated user's email (case-insensitive)
    if (invitation.email.toLowerCase().trim() !== userEmail.toLowerCase().trim()) {
      console.error(`Email mismatch: invitation email="${invitation.email}" vs user email="${userEmail}"`);
      throw new Error("This invitation is for a different email address");
    }

    // Check if user already has access to this organization
    const existingMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", invitation.organisation)
      )
      .first();

    if (existingMembership) {
      throw new Error("You already have access to this organization");
    }

    // Create organization membership for this user
    await ctx.db.insert("organizationMemberships", {
      userId: userId,
      organisation: invitation.organisation,
      role: invitation.role,
      createdAt: Date.now(),
    });

    // Mark invitation as accepted
    await ctx.db.patch(invitation._id, {
      status: "accepted",
    });

    return { success: true };
  },
});

// Internal action to send invitation email via Resend
export const sendInvitationEmail = internalAction({
  args: {
    email: v.string(),
    organisation: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    token: v.string(),
    inviterName: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Validate email address
    if (!args.email || typeof args.email !== 'string' || args.email.trim() === '') {
      console.error("Invalid email address provided:", args.email);
      return { success: false, error: "Invalid email address" };
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return { success: false, error: "Resend API key not configured" };
    }

    // Remove trailing slash from baseUrl if present
    let baseUrl = process.env.SITE_URL || "http://localhost:3000";
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    const encodedToken = encodeURIComponent(args.token);
    const inviteLink = `${baseUrl}/manager-signup?token=${encodedToken}`;
    const roleDisplay = args.role === "viewer" ? "View Only" : "Can Edit";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manager Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">You're Invited!</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        <strong>${args.inviterName}</strong> has invited you to join <strong>${args.organisation}</strong> on R u OK.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 8px 0; font-weight: 600;">Access Level:</p>
        <p style="color: #1e293b; font-size: 16px; margin: 0; font-weight: 600;">${roleDisplay}</p>
        <p style="color: #64748b; font-size: 14px; margin: 8px 0 0 0;">
          ${args.role === "viewer"
            ? "You'll be able to view the organization's wellbeing dashboard."
            : "You'll be able to view and edit the organization's wellbeing data."}
        </p>
      </div>

      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 24px 0;">
        Click the button below to set up your account and get started:
      </p>

      <div style="margin: 32px 0; text-align: center;">
        <a href="${inviteLink}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px;">
          Accept Invitation
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 14px; margin: 32px 0 0 0;">
        This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
      </p>

      <p style="color: #cbd5e1; font-size: 12px; margin: 24px 0 0 0; padding-top: 24px; border-top: 1px solid #e2e8f0;">
        If the button above doesn't work, copy and paste this link into your browser:<br>
        <a href="${inviteLink}" style="color: #3b82f6; word-break: break-all;">${inviteLink}</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "R u OK <noreply@harbourweb.org>",
          to: args.email,
          subject: `You've been invited to join ${args.organisation} on R u OK`,
          html: emailHtml,
        }),
      });

      if (response.ok) {
        console.log(`Invitation email sent successfully to ${args.email}`);
        return { success: true };
      } else {
        const errorText = await response.text();
        console.error(`Failed to send invitation email to ${args.email}:`, errorText);
        return { success: false, error: errorText };
      }
    } catch (error) {
      console.error(`Error sending invitation email to ${args.email}:`, error);
      return { success: false, error: String(error) };
    }
  },
});
