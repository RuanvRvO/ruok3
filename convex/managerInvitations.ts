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

    // Only owners can invite managers
    if (user.role !== "owner") {
      throw new Error("Only organization owners can invite managers");
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await ctx.db
      .query("managerInvitations")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) =>
        q.and(
          q.eq(q.field("organisation"), organisation),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();

    if (existingInvitation) {
      throw new Error("An invitation has already been sent to this email");
    }

    // Check if user with this email already exists in the organization
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    if (existingUser && existingUser.organisation === organisation) {
      throw new Error("This user already has access to your organization");
    }

    // Create the invitation
    const token = generateToken();
    const now = Date.now();
    const expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days

    const invitationId = await ctx.db.insert("managerInvitations", {
      email: args.email,
      organisation,
      role: args.role,
      invitedBy: userId,
      token,
      status: "pending",
      createdAt: now,
      expiresAt,
    });

    // Schedule email sending
    await ctx.scheduler.runAfter(0, internal.managerInvitations.sendInvitationEmail, {
      email: args.email,
      organisation,
      role: args.role,
      token,
      inviterName: user.name || user.email || "Your organization",
    });

    return { invitationId, token };
  },
});

// Query to list all manager invitations for an organization
export const listInvitations = query({
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

    const invitations = await ctx.db
      .query("managerInvitations")
      .withIndex("by_organisation", (q) => q.eq("organisation", organisation))
      .collect();

    return invitations;
  },
});

// Mutation to update manager role
export const updateManagerRole = mutation({
  args: {
    managerId: v.id("users"),
    role: v.union(v.literal("editor"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (user?.role !== "owner") {
      throw new Error("Only organization owners can update manager roles");
    }

    const manager = await ctx.db.get(args.managerId);
    if (!manager) {
      throw new Error("Manager not found");
    }

    if (manager.organisation !== user.organisation) {
      throw new Error("Manager is not in your organization");
    }

    if (manager.role === "owner") {
      throw new Error("Cannot change the role of an organization owner");
    }

    await ctx.db.patch(args.managerId, {
      role: args.role,
    });

    return { success: true };
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

    const user = await ctx.db.get(userId);
    if (user?.role !== "owner") {
      throw new Error("Only organization owners can revoke invitations");
    }

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.organisation !== user.organisation) {
      throw new Error("This invitation is not from your organization");
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

    // Update the user with organization and role
    await ctx.db.patch(args.userId, {
      organisation: invitation.organisation,
      role: invitation.role,
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
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return { success: false, error: "Resend API key not configured" };
    }

    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const inviteLink = `${baseUrl}/manager-signup?token=${args.token}`;
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

      <div style="margin: 32px 0;">
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
          from: "R u OK <onboarding@resend.dev>",
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
