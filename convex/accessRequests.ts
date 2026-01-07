import { v } from "convex/values";
import { mutation, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { validateAndNormalizeEmail } from "./emailValidation";

// Mutation to create an access request for a general invite link
export const createAccessRequest = mutation({
  args: {
    invitationId: v.id("managerInvitations"),
    requestedEmail: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get the invitation to verify it exists and get org/role info
      const invitation = await ctx.db.get(args.invitationId);
      if (!invitation) {
        throw new Error("Invitation not found. Please request a new invitation link.");
      }

      // Check if invitation is expired
      if (invitation.expiresAt < Date.now()) {
        throw new Error("This invitation has expired. Please request a new invitation link.");
      }

      // Only allow access requests for general links (not email-specific invites)
      if (invitation.invitationType === "email") {
        throw new Error("This is an email-specific invitation. Please use the link from your email.");
      }

      // Validate and normalize email
      let emailLower: string;
      try {
        emailLower = validateAndNormalizeEmail(args.requestedEmail);
      } catch {
        throw new Error("Please enter a valid email address.");
      }

      // Check if user with this email already has access to the organization
      const existingUser = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", emailLower))
        .first();

      if (existingUser) {
        const existingMembership = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_user_and_org", (q) =>
            q.eq("userId", existingUser._id).eq("organisation", invitation.organisation)
          )
          .first();

        if (existingMembership) {
          throw new Error("User already has access to this organization. Please sign in to continue.");
        }
      }

      // Check if there's already a pending request from this email for this organization
      const existingRequest = await ctx.db
        .query("accessRequests")
        .withIndex("by_email", (q) => q.eq("requestedEmail", emailLower))
        .filter((q) =>
          q.and(
            q.eq(q.field("organisation"), invitation.organisation),
            q.eq(q.field("status"), "pending")
          )
        )
        .first();

      if (existingRequest) {
        throw new Error("You already have a pending access request for this organization. Please wait for approval.");
      }

      // Create the access request
      const requestId = await ctx.db.insert("accessRequests", {
        invitationId: args.invitationId,
        requestedEmail: emailLower,
        organisation: invitation.organisation,
        role: invitation.role,
        status: "pending",
        requestedAt: Date.now(),
      });

      // Notify organization owner(s) via email
      await ctx.scheduler.runAfter(0, internal.accessRequests.sendAccessRequestNotification, {
        requestId,
        organisation: invitation.organisation,
        requestedEmail: emailLower,
        role: invitation.role,
      });

      return { success: true, requestId };
    } catch (error) {
      // If it's already an Error with a message, throw it as-is
      // This ensures our user-friendly error messages are preserved
      if (error instanceof Error) {
        throw error;
      }
      // For any other type of error, throw a generic user-friendly message
      throw new Error("Failed to submit access request. Please try again or contact support.");
    }
  },
});

// Query to list access requests for organizations the user owns
export const listAccessRequests = query({
  args: {
    organisation: v.string(),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("declined"))),
  },
  returns: v.array(v.object({
    _id: v.id("accessRequests"),
    _creationTime: v.number(),
    invitationId: v.id("managerInvitations"),
    requestedEmail: v.string(),
    organisation: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined")),
    requestedAt: v.number(),
    respondedAt: v.optional(v.number()),
    respondedBy: v.optional(v.id("users")),
  })),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // Check if user is owner of the organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      return [];
    }

    // Get access requests for this organization
    if (args.status) {
      const status = args.status;
      return await ctx.db
        .query("accessRequests")
        .withIndex("by_organisation_and_status", (q) =>
          q.eq("organisation", args.organisation).eq("status", status)
        )
        .collect();
    } else {
      return await ctx.db
        .query("accessRequests")
        .withIndex("by_organisation", (q) => q.eq("organisation", args.organisation))
        .collect();
    }
  },
});

// Mutation to approve an access request
export const approveAccessRequest = mutation({
  args: {
    requestId: v.id("accessRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Access request not found");
    }

    // Check if user is owner of the organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", request.organisation)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only organization owners can approve access requests");
    }

    if (request.status !== "pending") {
      throw new Error("This request has already been processed");
    }

    // Check if user already has an account
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", request.requestedEmail))
      .first();

    const userIdToAdd = existingUser?._id;

    // If user doesn't exist yet, they'll need to create an account
    // We'll just mark the request as approved and send them an email
    // When they sign up with this email, we can auto-add them to the org

    // Check if user already has membership (shouldn't happen but check anyway)
    if (userIdToAdd) {
      const existingMembership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user_and_org", (q) =>
          q.eq("userId", userIdToAdd).eq("organisation", request.organisation)
        )
        .first();

      if (!existingMembership) {
        // Create organization membership
        await ctx.db.insert("organizationMemberships", {
          userId: userIdToAdd,
          organisation: request.organisation,
          role: request.role,
          createdAt: Date.now(),
        });
      }
    }

    // Update request status
    await ctx.db.patch(args.requestId, {
      status: "approved",
      respondedAt: Date.now(),
      respondedBy: userId,
    });

    // Send approval email to requester
    await ctx.scheduler.runAfter(0, internal.accessRequests.sendAccessRequestApprovalEmail, {
      requestedEmail: request.requestedEmail,
      organisation: request.organisation,
      role: request.role,
      hasAccount: !!existingUser,
    });

    return { success: true };
  },
});

// Mutation to decline an access request
export const declineAccessRequest = mutation({
  args: {
    requestId: v.id("accessRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Access request not found");
    }

    // Check if user is owner of the organization
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", request.organisation)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only organization owners can decline access requests");
    }

    if (request.status !== "pending") {
      throw new Error("This request has already been processed");
    }

    // Update request status
    await ctx.db.patch(args.requestId, {
      status: "declined",
      respondedAt: Date.now(),
      respondedBy: userId,
    });

    // Send decline email to requester
    await ctx.scheduler.runAfter(0, internal.accessRequests.sendAccessRequestDeclineEmail, {
      requestedEmail: request.requestedEmail,
      organisation: request.organisation,
    });

    return { success: true };
  },
});

// Query to check if a user has an approved access request for signup flow
export const checkApprovedAccessRequest = query({
  args: {
    email: v.string(),
    organisation: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("accessRequests"),
      _creationTime: v.number(),
      invitationId: v.id("managerInvitations"),
      requestedEmail: v.string(),
      organisation: v.string(),
      role: v.union(v.literal("editor"), v.literal("viewer")),
      status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined")),
      requestedAt: v.number(),
      respondedAt: v.optional(v.number()),
      respondedBy: v.optional(v.id("users")),
    })
  ),
  handler: async (ctx, args) => {
    const emailLower = args.email.toLowerCase().trim();

    const approvedRequest = await ctx.db
      .query("accessRequests")
      .withIndex("by_email", (q) => q.eq("requestedEmail", emailLower))
      .filter((q) =>
        q.and(
          q.eq(q.field("organisation"), args.organisation),
          q.eq(q.field("status"), "approved")
        )
      )
      .first();

    return approvedRequest;
  },
});

// Internal action to send access request notification to organization owners
export const sendAccessRequestNotification = internalAction({
  args: {
    requestId: v.id("accessRequests"),
    organisation: v.string(),
    requestedEmail: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { success: false, error: "Resend API key not configured" };
    }

    // Get all owners of the organization
    const memberships = await ctx.runQuery(internal.organizationMemberships.getOrganizationMembersInternal, {
      organisation: args.organisation,
    });

    const owners = memberships.filter((m) => m.role === "owner");

    if (owners.length === 0) {
      return { success: false, error: "No owners found" };
    }

    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const managersUrl = `${baseUrl}/manager/managers`;
    const roleDisplay = args.role === "viewer" ? "View Only" : "Can Edit";

    // Send email to all owners
    for (const owner of owners) {
      if (!owner.email) continue;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Access Request</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">New Access Request</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        Someone has requested access to <strong>${args.organisation}</strong> on R u OK.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 8px 0; font-weight: 600;">Requested Email:</p>
        <p style="color: #1e293b; font-size: 16px; margin: 0; font-weight: 600;">${args.requestedEmail}</p>
        <p style="color: #475569; font-size: 14px; margin: 12px 0 0 0; font-weight: 600;">Access Level:</p>
        <p style="color: #1e293b; font-size: 16px; margin: 0;">${roleDisplay}</p>
      </div>

      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 24px 0;">
        Click the button below to review and approve or decline this request:
      </p>

      <div style="margin: 32px 0; text-align: center;">
        <a href="${managersUrl}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px;">
          Review Request
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 14px; margin: 32px 0 0 0;">
        You can approve or decline this request in your Member Access settings.
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
            to: owner.email,
            subject: `New Access Request for ${args.organisation}`,
            html: emailHtml,
          }),
        });

        if (!response.ok) {
          // Failed to send notification
        }
      } catch {
        // Error sending notification
      }
    }

    return { success: true };
  },
});

// Internal action to send approval email
export const sendAccessRequestApprovalEmail = internalAction({
  args: {
    requestedEmail: v.string(),
    organisation: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    hasAccount: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { success: false, error: "Resend API key not configured" };
    }

    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const signInUrl = `${baseUrl}/signin`;
    const roleDisplay = args.role === "viewer" ? "View Only" : "Can Edit";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Request Approved</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">Access Request Approved! 🎉</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        Great news! Your access request to <strong>${args.organisation}</strong> has been approved.
      </p>

      <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="color: #15803d; font-size: 14px; margin: 0 0 8px 0; font-weight: 600;">Access Level:</p>
        <p style="color: #166534; font-size: 16px; margin: 0; font-weight: 600;">${roleDisplay}</p>
      </div>

      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 24px 0;">
        ${args.hasAccount
          ? "Sign in to R u OK to access your organization's dashboard:"
          : "Create your account on R u OK using this email address to get started:"
        }
      </p>

      <div style="margin: 32px 0; text-align: center;">
        <a href="${signInUrl}" style="display: inline-block; background-color: #22c55e; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px;">
          ${args.hasAccount ? "Sign In Now" : "Create Account"}
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 14px; margin: 32px 0 0 0;">
        Welcome to R u OK! If you have any questions, please contact your organization administrator.
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
          to: args.requestedEmail,
          subject: `Access Approved: ${args.organisation} on R u OK`,
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

// Internal action to send decline email
export const sendAccessRequestDeclineEmail = internalAction({
  args: {
    requestedEmail: v.string(),
    organisation: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { success: false, error: "Resend API key not configured" };
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Request Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">Access Request Update</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        Your access request to <strong>${args.organisation}</strong> could not be approved at this time.
      </p>

      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 24px 0;">
        If you believe this is a mistake or would like to request access again, please contact your organization administrator directly.
      </p>

      <p style="color: #94a3b8; font-size: 14px; margin: 32px 0 0 0;">
        Thank you for your interest in R u OK.
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
          to: args.requestedEmail,
          subject: `Access Request Update: ${args.organisation}`,
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
