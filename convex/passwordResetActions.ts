"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Internal action to update password hash using bcrypt
export const updatePasswordHash = internalAction({
  args: {
    accountId: v.id("authAccounts"),
    newPassword: v.string(),
    resetId: v.id("passwordResets"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; requiresSignup?: boolean; email?: string; message?: string }> => {
    // Import bcryptjs for password hashing
    const bcrypt = await import("bcryptjs");

    // Get the auth account
    const account = await ctx.runQuery(internal.passwordReset.getAuthAccount, {
      accountId: args.accountId,
    });

    if (!account) {
      throw new Error("Auth account not found");
    }

    // Hash the new password
    const hashedPassword = bcrypt.hashSync(args.newPassword, 10);
    
    // Verify the hash works by comparing
    const isValid = await bcrypt.compare(args.newPassword, hashedPassword);
    if (!isValid) {
      throw new Error("Password hash verification failed");
    }
    
    try {
      // Update the account's password hash
      await ctx.runMutation(internal.passwordReset.updateAuthAccountPassword, {
        accountId: args.accountId,
        passwordHash: hashedPassword,
      });

      // Wait for the database to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the update
      const updatedAccount = await ctx.runQuery(internal.passwordReset.getAuthAccount, {
        accountId: args.accountId,
      });

      if (!updatedAccount) {
        throw new Error("Failed to verify password update");
      }

      const storedSecret = (updatedAccount as { secret?: string }).secret;
      if (storedSecret !== hashedPassword) {
        throw new Error("Password hash was not updated correctly");
      }

      // Verify the stored hash can authenticate the password
      const canVerify = await bcrypt.compare(args.newPassword, storedSecret);
      if (!canVerify) {
        throw new Error("Stored password hash cannot verify the password");
      }

      // Mark the reset token as used
      await ctx.runMutation(internal.passwordReset.markResetAsUsed, {
        resetId: args.resetId,
      });

      return {
        success: true,
        message: "Password has been reset successfully. Please sign in with your new password."
      };
    } catch (error) {
      throw error;
    }
  },
});

