import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Generate a random token for email verification
function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Mutation to send verification email
export const sendVerificationEmail = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get user
    const user = await ctx.db.get(args.userId);
    if (!user || !user.email) {
      throw new Error("User not found or has no email");
    }

    // Check if user is already verified
    if (user.emailVerificationTime) {
      return { success: true, message: "Email already verified" };
    }

    // Check if there's a recent verification email (within last 5 minutes)
    const recentVerification = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("used"), false),
          q.gt(q.field("expiresAt"), Date.now())
        )
      )
      .first();

    if (recentVerification) {
      return { success: true, message: "A verification email was recently sent. Please check your inbox." };
    }

    // Generate token and expiration (24 hours from now)
    const token = generateToken();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

    // Create email verification record
    await ctx.db.insert("emailVerifications", {
      email: user.email.toLowerCase().trim(),
      token,
      userId: args.userId,
      expiresAt,
      used: false,
      createdAt: Date.now(),
    });

    // Send verification email
    await ctx.scheduler.runAfter(0, internal.emailVerification.sendVerificationEmailAction, {
      email: user.email.toLowerCase().trim(),
      token,
      userName: user.name || "there",
    });

    return { success: true, message: "Verification email sent. Please check your inbox." };
  },
});

// Internal action to send verification email via Resend
export const sendVerificationEmailAction = internalAction({
  args: {
    email: v.string(),
    token: v.string(),
    userName: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { success: false, error: "Resend API key not configured" };
    }

    // Remove trailing slash from baseUrl if present
    let baseUrl = process.env.SITE_URL || "http://localhost:3000";
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    const encodedToken = encodeURIComponent(args.token);
    const verifyLink = `${baseUrl}/verify-email?token=${encodedToken}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">Verify Your Email</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        Hi ${args.userName},
      </p>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        Welcome to R u OK! Please verify your email address by clicking the button below:
      </p>

      <div style="margin: 32px 0; text-align: center;">
        <a href="${verifyLink}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px;">
          Verify Email Address
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 14px; margin: 32px 0 0 0;">
        This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
      </p>

      <p style="color: #cbd5e1; font-size: 12px; margin: 24px 0 0 0; padding-top: 24px; border-top: 1px solid #e2e8f0;">
        If the button above doesn't work, copy and paste this link into your browser:<br>
        <a href="${verifyLink}" style="color: #3b82f6; word-break: break-all;">${verifyLink}</a>
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
          subject: "Verify Your Email - R u OK",
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

// Query to verify email verification token
export const verifyToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const verification = await ctx.db
      .query("emailVerifications")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!verification) {
      return { valid: false, message: "Invalid verification token" };
    }

    if (verification.used) {
      return { valid: false, message: "This verification link has already been used" };
    }

    if (verification.expiresAt < Date.now()) {
      return { valid: false, message: "This verification link has expired" };
    }

    return { valid: true, email: verification.email };
  },
});

// Mutation to verify email using token
export const verifyEmail = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the verification record
    const verification = await ctx.db
      .query("emailVerifications")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!verification) {
      throw new Error("Invalid verification token");
    }

    if (verification.used) {
      throw new Error("This verification link has already been used");
    }

    if (verification.expiresAt < Date.now()) {
      await ctx.db.patch(verification._id, { used: true });
      throw new Error("This verification link has expired");
    }

    // Get the user
    const user = await ctx.db.get(verification.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if already verified
    if (user.emailVerificationTime) {
      await ctx.db.patch(verification._id, { used: true });
      return { success: true, message: "Email already verified", alreadyVerified: true };
    }

    // Mark email as verified
    await ctx.db.patch(verification.userId, {
      emailVerificationTime: Date.now(),
    });

    // Mark token as used
    await ctx.db.patch(verification._id, { used: true });

    return {
      success: true,
      message: "Email verified successfully! You can now access your account.",
      alreadyVerified: false,
    };
  },
});

// Internal mutation to mark verification as used
export const markVerificationAsUsed = internalMutation({
  args: {
    verificationId: v.id("emailVerifications"),
  },
  handler: async (ctx, args) => {
    const verification = await ctx.db.get(args.verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }
    if (verification.used) {
      return;
    }
    await ctx.db.patch(args.verificationId, { used: true });
  },
});

// Public mutation to resend verification email (doesn't require auth)
export const resendVerificationEmail = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const emailLower = args.email.toLowerCase().trim();

    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", emailLower))
      .first();

    if (!user) {
      // Don't reveal if user exists or not for security
      return { success: true, message: "If an account exists with this email, a verification email will be sent." };
    }

    // Check if user is already verified
    if (user.emailVerificationTime) {
      return { success: true, message: "Email already verified" };
    }

    // Check if there's a recent verification email (within last 2 minutes)
    const recentVerification = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("used"), false),
          q.gt(q.field("createdAt"), Date.now() - (2 * 60 * 1000)) // Within last 2 minutes
        )
      )
      .first();

    if (recentVerification) {
      return { success: true, message: "A verification email was recently sent. Please check your inbox and spam folder." };
    }

    // Generate new token
    const token = generateToken();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

    // Create email verification record
    await ctx.db.insert("emailVerifications", {
      email: emailLower,
      token,
      userId: user._id,
      expiresAt,
      used: false,
      createdAt: Date.now(),
    });

    // Send verification email
    await ctx.scheduler.runAfter(0, internal.emailVerification.sendVerificationEmailAction, {
      email: emailLower,
      token,
      userName: user.name || "there",
    });

    return { success: true, message: "Verification email sent. Please check your inbox and spam folder." };
  },
});
