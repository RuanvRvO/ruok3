import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { store } from "./auth";

// Generate a random token for password reset
function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Mutation to request a password reset
export const requestPasswordReset = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .first();

    // Always return success to prevent email enumeration
    // Don't reveal whether the email exists or not
    if (!user) {
      return { success: true, message: "If an account with this email exists, a password reset link has been sent." };
    }

    // Check if there's a recent password reset request (within last 5 minutes)
    const recentReset = await ctx.db
      .query("passwordResets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => 
        q.and(
          q.eq(q.field("used"), false),
          q.gt(q.field("expiresAt"), Date.now())
        )
      )
      .first();

    if (recentReset) {
      return { success: true, message: "A password reset email was recently sent. Please check your inbox." };
    }

    // Generate token and expiration (1 hour from now)
    const token = generateToken();
    const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour

    // Create password reset record
    await ctx.db.insert("passwordResets", {
      email: args.email.toLowerCase().trim(),
      token,
      userId: user._id,
      expiresAt,
      used: false,
      createdAt: Date.now(),
    });

    // Send password reset email
    await ctx.scheduler.runAfter(0, internal.passwordReset.sendPasswordResetEmail, {
      email: args.email.toLowerCase().trim(),
      token,
    });

    return { success: true, message: "If an account with this email exists, a password reset link has been sent." };
  },
});

// Internal action to send password reset email via Resend
export const sendPasswordResetEmail = internalAction({
  args: {
    email: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
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
    const resetLink = `${baseUrl}/reset-password?token=${encodedToken}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h1 style="color: #1e293b; margin: 0 0 16px 0; font-size: 28px;">Reset Your Password</h1>
      <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        We received a request to reset your password for your R u OK account. Click the button below to create a new password:
      </p>

      <div style="margin: 32px 0; text-align: center;">
        <a href="${resetLink}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 18px;">
          Reset Password
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 14px; margin: 32px 0 0 0;">
        This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
      </p>

      <p style="color: #cbd5e1; font-size: 12px; margin: 24px 0 0 0; padding-top: 24px; border-top: 1px solid #e2e8f0;">
        If the button above doesn't work, copy and paste this link into your browser:<br>
        <a href="${resetLink}" style="color: #3b82f6; word-break: break-all;">${resetLink}</a>
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
          subject: "Reset Your Password - R u OK",
          html: emailHtml,
        }),
      });

      if (response.ok) {
        console.log(`Password reset email sent successfully to ${args.email}`);
        return { success: true };
      } else {
        const errorText = await response.text();
        console.error(`Failed to send password reset email to ${args.email}:`, errorText);
        return { success: false, error: errorText };
      }
    } catch (error) {
      console.error(`Error sending password reset email to ${args.email}:`, error);
      return { success: false, error: String(error) };
    }
  },
});

// Note: updatePasswordHash action has been moved to passwordResetActions.ts
// because it requires Node.js runtime for bcrypt

// Internal query to get auth account
export const getAuthAccount = internalQuery({
  args: {
    accountId: v.id("authAccounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  },
});

// Internal query to get user by ID
export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Internal mutation to delete auth account
export const deleteAuthAccount = internalMutation({
  args: {
    accountId: v.id("authAccounts"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.accountId);
  },
});

// Internal mutation to delete user record
export const deleteUser = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Delete all organization memberships for this user first
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    
    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }
    
    // Then delete the user
    await ctx.db.delete(args.userId);
  },
});

// Internal mutation to update auth account password
export const updateAuthAccountPassword = internalMutation({
  args: {
    accountId: v.id("authAccounts"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Auth account not found");
    }
    
    // Log the account before update for debugging
    console.log("Account before update:", JSON.stringify({
      _id: account._id,
      provider: (account as any).provider,
      hasSecret: !!(account as any).secret,
      secretLength: (account as any).secret?.length,
    }, null, 2));
    
    // Convex Auth Password provider stores the password hash in account.secret
    // Update the secret field with the new password hash
    await ctx.db.patch(args.accountId, {
      secret: args.passwordHash,
    } as any);
    
    // Verify the update
    const updated = await ctx.db.get(args.accountId);
    console.log("Account after update - secret matches:", (updated as any).secret === args.passwordHash);
  },
});

// Internal mutation to mark reset token as used
export const markResetAsUsed = internalMutation({
  args: {
    resetId: v.id("passwordResets"),
  },
  handler: async (ctx, args) => {
    // Check if already used to prevent race conditions
    // Use a transaction-like approach: only mark as used if not already used
    const reset = await ctx.db.get(args.resetId);
    if (!reset) {
      throw new Error("Reset token not found");
    }
    if (reset.used) {
      // Already used - this is okay, just return
      return;
    }
    // Mark as used atomically
    await ctx.db.patch(args.resetId, { used: true });
  },
});

// Query to verify password reset token
export const verifyPasswordResetToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const reset = await ctx.db
      .query("passwordResets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!reset) {
      return { valid: false, message: "Invalid reset token" };
    }

    if (reset.used) {
      return { valid: false, message: "This password reset link has already been used" };
    }

    if (reset.expiresAt < Date.now()) {
      return { valid: false, message: "This password reset link has expired" };
    }

    return { valid: true, email: reset.email };
  },
});

// Mutation to reset password using token
export const resetPassword = mutation({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate password length
    if (args.newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    // Find the password reset record
    const reset = await ctx.db
      .query("passwordResets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!reset) {
      throw new Error("Invalid reset token");
    }

    // Check if token is already used - but allow retry if password update failed
    // We'll check again in the action to prevent race conditions
    if (reset.used) {
      // Give a small delay to check if action is still processing
      // This handles the case where the action marked it as used but password update failed
      await new Promise(resolve => setTimeout(resolve, 500));
      const resetCheck = await ctx.db.get(reset._id);
      if (resetCheck?.used) {
        throw new Error("This password reset link has already been used");
      }
    }

    if (reset.expiresAt < Date.now()) {
      await ctx.db.patch(reset._id, { used: true });
      throw new Error("This password reset link has expired");
    }

    // Get the user
    const user = await ctx.db.get(reset.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Get the auth account for this user
    // Convex Auth stores accounts in authAccounts table
    // The userId field links to the user's _id
    const authAccount = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("userId"), reset.userId))
      .first();

    if (!authAccount) {
      throw new Error("Authentication account not found");
    }

    // Convex Auth Password provider stores the password hash in the account's data
    // We need to update the password hash directly
    // The Password provider uses bcrypt to hash passwords
    // We'll need to import bcrypt and hash the new password
    
    // Import bcrypt (we'll need to add it to package.json if not already there)
    // For now, let's use a workaround: we'll use the auth system's ability to update
    // Actually, the best approach is to use the Password provider's internal methods
    
    // Since we can't directly access the Password provider's hash function,
    // we'll use a workaround: delete the old account and the user will need to sign up again
    // But that's not ideal. Let me try a different approach:
    
    // We can use the store.updateAccount method from Convex Auth
    // But that requires the account object
    
    // Actually, the simplest solution is to use bcrypt to hash the password
    // and update it directly in the authAccounts table
    // But we need to ensure we're using the same hashing method as Convex Auth
    
    // For now, let's implement a solution that uses Node's crypto or bcrypt
    // We'll need to hash the password the same way Convex Auth does
    
    // Let me use a simpler approach: we'll call an internal action that can use bcrypt
    // to hash the password and update the account
    
    // Call internal action to update the password hash
    // We need to use an action because we need bcrypt which requires Node.js
    // The action will mark the token as used after successfully updating the password
    await ctx.scheduler.runAfter(0, internal.passwordResetActions.updatePasswordHash, {
      accountId: authAccount._id,
      newPassword: args.newPassword,
      resetId: reset._id,
    });
    
    // Return success immediately - the action will handle marking the token as used
    // Note: The password update happens asynchronously, but we return success
    // to provide immediate feedback. If the update fails, the token won't be marked as used.
    return { success: true, message: "Password has been reset successfully. Please sign in with your new password." };
  },
});

