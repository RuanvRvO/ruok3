import { v } from "convex/values";
import { mutation, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { validateAndNormalizeEmail } from "./emailValidation";

// Role hierarchy for comparing access levels (higher number = more access)
const ROLE_HIERARCHY: Record<string, number> = {
  "owner": 3,
  "editor": 2,
  "viewer": 1
};

// Generate a cryptographically secure random token for invitation
function generateToken(): string {
  // Use crypto.randomUUID() for secure token generation
  // Falls back to timestamp-based token if crypto is not available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
  }
  // Fallback: combine multiple random sources for better entropy
  const random1 = Math.random().toString(36).substring(2);
  const random2 = Math.random().toString(36).substring(2);
  return random1 + random2 + Date.now().toString(36);
}

// Mutation to create a manager invitation URL (with optional email for direct invites)
export const createInvitation = mutation({
  args: {
    role: v.union(v.literal("editor"), v.literal("viewer")),
    organisation: v.string(),
    email: v.optional(v.string()),
    baseUrl: v.optional(v.string()), // Frontend can pass the current URL
  },
  returns: v.union(
    v.object({ success: v.literal(true), invitationId: v.id("managerInvitations"), mode: v.literal("email"), message: v.string() }),
    v.object({ success: v.literal(true), invitationId: v.id("managerInvitations"), token: v.string(), mode: v.literal("link") })
  ),
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

    const token = generateToken();
    const now = Date.now();
    const expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days

    // Determine invitation type based on email presence
    const hasEmail = args.email && args.email.trim().length > 0;
    const invitationType = hasEmail ? "email" : "link";

    // Validate email if provided
    if (hasEmail) {
      // Validate and normalize email
      const emailLower = validateAndNormalizeEmail(args.email!);

      // Check for existing pending invitation to same email for same org
      const existingInvitation = await ctx.db
        .query("managerInvitations")
        .withIndex("by_email", (q) => q.eq("email", emailLower))
        .filter((q) =>
          q.and(
            q.eq(q.field("organisation"), args.organisation),
            q.eq(q.field("status"), "pending"),
            q.gt(q.field("expiresAt"), now)
          )
        )
        .first();

      if (existingInvitation) {
        throw new Error("An invitation has already been sent to this email address for this organization");
      }

      // Check if user already has access
      const existingUser = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", emailLower))
        .first();

      if (existingUser) {
        const existingMembership = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_user_and_org", (q) =>
            q.eq("userId", existingUser._id).eq("organisation", args.organisation)
          )
          .first();

        if (existingMembership) {
          const roleDisplay = existingMembership.role === "owner" ? "Owner" : 
                              existingMembership.role === "editor" ? "Editor" : "Viewer";
          throw new Error(`This user already has access to ${args.organisation} as ${roleDisplay}. They can sign in to access the organization.`);
        }
      }
    }

    // Create the invitation
    const invitationId = await ctx.db.insert("managerInvitations", {
      email: hasEmail ? args.email!.toLowerCase().trim() : undefined,
      organisation: args.organisation,
      role: args.role,
      invitedBy: userId,
      token,
      status: "pending",
      invitationType,
      createdAt: now,
      expiresAt,
    });

    // If email provided, send email
    if (hasEmail) {
      // Get inviter name for email
      const inviter = await ctx.db.get(userId);
      const inviterName = inviter?.name && inviter?.surname
        ? `${inviter.name} ${inviter.surname}`
        : inviter?.email || "Someone";

      // Schedule email send
      await ctx.scheduler.runAfter(0, internal.managerInvitations.sendInvitationEmail, {
        email: args.email!.toLowerCase().trim(),
        organisation: args.organisation,
        role: args.role,
        token,
        inviterName,
        baseUrl: args.baseUrl, // Pass the frontend's URL
      });

      return {
        success: true as const,
        invitationId,
        mode: "email" as const,
        message: `Invitation email sent to ${args.email}`
      };
    }

    // Return token for link-based invitations
    return {
      success: true as const,
      invitationId,
      token,
      mode: "link" as const
    };
  },
});

// Query to list all manager invitations for organizations the user owns
export const listInvitations = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("managerInvitations"),
    _creationTime: v.number(),
    email: v.optional(v.string()),
    organisation: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    invitedBy: v.id("users"),
    token: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("expired")),
    invitationType: v.optional(v.union(v.literal("email"), v.literal("link"))),
    createdAt: v.number(),
    expiresAt: v.number(),
  })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Get all organizations where user is owner
    const allMemberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const orgNames = allMemberships
      .filter((m) => m.role === "owner")
      .map((m) => m.organisation);

    // Fetch invitations per owned org (avoids full-table scan)
    const invitationSets = await Promise.all(
      orgNames.map((org) =>
        ctx.db
          .query("managerInvitations")
          .withIndex("by_organisation", (q) => q.eq("organisation", org))
          .collect()
      )
    );
    const invitations = invitationSets.flat();

    return invitations;
  },
});

// Mutation to revoke/delete an invitation
export const revokeInvitation = mutation({
  args: {
    invitationId: v.id("managerInvitations"),
  },
  returns: v.object({ success: v.literal(true) }),
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

    return { success: true as const };
  },
});

// Query to get invitation by token
export const getInvitationByToken = query({
  args: {
    token: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("managerInvitations"),
      _creationTime: v.number(),
      email: v.optional(v.string()),
      organisation: v.string(),
      role: v.union(v.literal("editor"), v.literal("viewer")),
      invitedBy: v.id("users"),
      status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("expired")),
      invitationType: v.optional(v.union(v.literal("email"), v.literal("link"))),
      createdAt: v.number(),
      expiresAt: v.number(),
      isExpired: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("managerInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) {
      return null;
    }

    // Return invitation details without echoing back the token (caller already has it)
    const isExpired = invitation.expiresAt < Date.now();
    return {
      _id: invitation._id,
      _creationTime: invitation._creationTime,
      email: invitation.email,
      organisation: invitation.organisation,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      status: invitation.status,
      invitationType: invitation.invitationType,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      isExpired,
    };
  },
});

// Mutation to accept invitation for newly created accounts
// NOTE: This mutation does NOT validate email matching because:
// 1. It's only called after creating a new account in the accept-invitation page
// 2. The frontend validates that the created account's email matches invitation.email
// 3. The frontend forces sign-out if wrong user is authenticated
// For existing users, use acceptInvitationForExistingUser instead
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

    // Check if invitation is expired (but allow reuse if not expired)
    if (invitation.expiresAt < Date.now()) {
      await ctx.db.patch(invitation._id, { status: "expired" });
      throw new Error("This invitation has expired");
    }
    
    // Allow reuse of invitations - only check if expired, not if already used
    // Invitations can be used by multiple people until they expire

    // Get user to verify their email
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new Error("User not found. Please try signing in again.");
    }

    if (!user.email) {
      throw new Error("User email is not set. Please try signing in again.");
    }

    // Auto-approve any pending access requests for this invitation and email
    // This handles the case where user went through request-access flow
    const userEmail = user.email.toLowerCase().trim();
    const pendingRequest = await ctx.db
      .query("accessRequests")
      .withIndex("by_email", (q) => q.eq("requestedEmail", userEmail))
      .filter((q) =>
        q.and(
          q.eq(q.field("invitationId"), invitation._id),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();

    if (pendingRequest) {
      // Auto-approve the access request since they verified their email
      await ctx.db.patch(pendingRequest._id, {
        status: "approved",
        respondedAt: Date.now(),
        respondedBy: invitation.invitedBy, // Use the invitation creator as the approver
      });
    }

    // Check if user already has a membership BEFORE enforcing single-use rules.
    const existingMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", args.userId).eq("organisation", invitation.organisation)
      )
      .first();

    if (existingMembership) {
      const existingRoleLevel = ROLE_HIERARCHY[existingMembership.role] || 0;
      const invitationRoleLevel = ROLE_HIERARCHY[invitation.role] || 0;

      if (existingRoleLevel >= invitationRoleLevel) {
        return {
          success: true,
          alreadyHasAccess: true,
          existingRole: existingMembership.role,
        };
      }

      await ctx.db.patch(existingMembership._id, { role: invitation.role });
      return { success: true, upgraded: true };
    }

    // Enforce email matching for email-based invitations (only when user lacks membership)
    if (invitation.invitationType === "email") {
      const invitationEmail = invitation.email?.toLowerCase().trim();

      if (!invitationEmail) {
        throw new Error("Invalid invitation: missing email");
      }

      if (userEmail !== invitationEmail) {
        throw new Error("This invitation is for a different email address");
      }

      // Do NOT block on invitation.status === "accepted" here.
      // Email match already proves this invitation is for this specific user.
    }

    {
      // Create organization membership for the user
      const membershipId = await ctx.db.insert("organizationMemberships", {
        userId: args.userId,
        organisation: invitation.organisation,
        role: invitation.role,
        createdAt: Date.now(),
      });
      
      // Verify the membership was created
      const createdMembership = await ctx.db.get(membershipId);
      if (!createdMembership) {
        throw new Error(`Failed to create organization membership. Membership ID: ${membershipId}`);
      }
    }

    // Mark email invitations as accepted (single-use)
    // Link invitations remain reusable
    if (invitation.invitationType === "email") {
      await ctx.db.patch(invitation._id, { status: "accepted" });
    }

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

    // Check if invitation is expired (but allow reuse if not expired)
    if (invitation.expiresAt < Date.now()) {
      await ctx.db.patch(invitation._id, { status: "expired" });
      throw new Error("This invitation has expired");
    }

    // Auto-approve any pending access requests for this invitation and email
    // This handles the case where user went through request-access flow
    const userEmail = user.email.toLowerCase().trim();
    const pendingRequest = await ctx.db
      .query("accessRequests")
      .withIndex("by_email", (q) => q.eq("requestedEmail", userEmail))
      .filter((q) =>
        q.and(
          q.eq(q.field("invitationId"), invitation._id),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();

    if (pendingRequest) {
      // Auto-approve the access request since they verified their email
      await ctx.db.patch(pendingRequest._id, {
        status: "approved",
        respondedAt: Date.now(),
        respondedBy: invitation.invitedBy, // Use the invitation creator as the approver
      });
    }

    // Check if user already has access BEFORE enforcing single-use rules.
    // If they're already a member (e.g. they accepted before and are re-clicking
    // the link), just return gracefully instead of throwing.
    const existingMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", invitation.organisation)
      )
      .first();

    if (existingMembership) {
      const existingRoleLevel = ROLE_HIERARCHY[existingMembership.role] || 0;
      const invitationRoleLevel = ROLE_HIERARCHY[invitation.role] || 0;

      if (existingRoleLevel >= invitationRoleLevel) {
        return {
          success: true,
          alreadyHasAccess: true,
          existingRole: existingMembership.role,
        };
      }

      // Upgrade to the higher role granted by the invitation
      await ctx.db.patch(existingMembership._id, { role: invitation.role });
      return { success: true, upgraded: true };
    }

    // Enforce email matching for email-based invitations (only when user lacks membership)
    if (invitation.invitationType === "email") {
      const invitationEmail = invitation.email?.toLowerCase().trim();

      if (!invitationEmail) {
        throw new Error("Invalid invitation: missing email");
      }

      if (userEmail !== invitationEmail) {
        throw new Error("This invitation is for a different email address");
      }

      // Do NOT block on invitation.status === "accepted" here.
      // The email match above already proves this invitation is for this specific user.
      // Blocking on status would prevent re-acceptance after account deletion removes membership.
    }

    // Create organization membership for this user
    await ctx.db.insert("organizationMemberships", {
      userId: userId,
      organisation: invitation.organisation,
      role: invitation.role,
      createdAt: Date.now(),
    });

    // Mark email invitations as accepted (single-use)
    // Link invitations remain reusable
    if (invitation.invitationType === "email") {
      await ctx.db.patch(invitation._id, { status: "accepted" });
    }

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
    baseUrl: v.optional(v.string()), // URL from frontend
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Validate email address
    if (!args.email || typeof args.email !== 'string' || args.email.trim() === '') {
      return { success: false, error: "Invalid email address" };
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { success: false, error: "Resend API key not configured" };
    }

    // Build the base URL for the invitation link
    // Priority: Frontend-provided baseUrl > SITE_URL (env var) > localhost
    let baseUrl = args.baseUrl || process.env.SITE_URL || "http://localhost:3000";

    // Remove trailing slash from baseUrl if present
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    const encodedToken = encodeURIComponent(args.token);
    const inviteLink = `${baseUrl}/accept-invitation?token=${encodedToken}`;
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
        return { success: true };
      } else {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
});

// Mutation to fix orphaned invitations - if invitation is accepted but membership doesn't exist
export const fixOrphanedInvitation = mutation({
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

    const userEmail = user.email; // TypeScript now knows this is definitely a string

    // If invitation doesn't have an email yet, set it to the user's email
    // Otherwise, verify the invitation email matches the authenticated user's email (case-insensitive)
    if (invitation.email) {
      if (invitation.email.toLowerCase().trim() !== userEmail.toLowerCase().trim()) {
        throw new Error("This invitation is for a different email address");
      }
    } else {
      // Update invitation with user's email
      await ctx.db.patch(invitation._id, {
        email: userEmail,
      });
    }

    // Check if membership already exists
    const existingMembership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", invitation.organisation)
      )
      .first();

    if (existingMembership) {
      return { success: true, message: "Membership already exists" };
    }

    // Create the missing membership
    await ctx.db.insert("organizationMemberships", {
      userId: userId,
      organisation: invitation.organisation,
      role: invitation.role,
      createdAt: Date.now(),
    });

    return { success: true, message: "Membership created" };
  },
});
