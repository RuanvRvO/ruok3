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
    // Import bcryptjs - Convex Auth likely uses bcryptjs (pure JS) rather than native bcrypt
    // bcryptjs is more compatible across different environments
    let bcrypt: any;
    try {
      // Try bcryptjs first (pure JS, more compatible)
      bcrypt = await import("bcryptjs");
    } catch (e) {
      try {
        // Fall back to native bcrypt if bcryptjs is not available
        bcrypt = await import("bcrypt");
      } catch (e2) {
        throw new Error("bcryptjs or bcrypt is required for password reset. Please install one: npm install bcryptjs @types/bcryptjs OR npm install bcrypt @types/bcrypt");
      }
    }
    
    // Get the auth account first to see the current structure
    const account = await ctx.runQuery(internal.passwordReset.getAuthAccount, {
      accountId: args.accountId,
    });
    
    if (!account) {
      throw new Error("Auth account not found");
    }
    
    // Log the account structure for debugging
    // Check if secret looks like bcrypt ($2a$, $2b$, $2y$) or something else
    const secret = (account as any).secret;
    const isBcryptFormat = secret && typeof secret === 'string' && (secret.startsWith('$2a$') || secret.startsWith('$2b$') || secret.startsWith('$2y$'));
    
    console.log("Account structure:", JSON.stringify({
      _id: account._id,
      provider: (account as any).provider,
      providerAccountId: (account as any).providerAccountId,
      userId: (account as any).userId,
      hasSecret: !!secret,
      secretLength: secret?.length,
      secretPrefix: secret?.substring(0, 20), // First 20 chars to see format
      isBcryptFormat: isBcryptFormat,
      secretType: typeof secret,
      // Log full secret for debugging (temporary - remove in production)
      // This will help us understand the format Convex Auth uses
      fullSecret: secret,
      // Try to parse as JSON to see if it's structured data
      isJSON: (() => {
        try {
          JSON.parse(secret || '');
          return true;
        } catch {
          return false;
        }
      })(),
    }, null, 2));
    
    // Check if the original secret is already in bcrypt format
    // If not, we might need to preserve the original format or use a different approach
    const originalSecret = (account as any).secret;
    const isOriginalBcrypt = originalSecret && typeof originalSecret === 'string' && 
      (originalSecret.startsWith('$2a$') || originalSecret.startsWith('$2b$') || originalSecret.startsWith('$2y$'));
    
    if (!isOriginalBcrypt) {
      console.warn("Original secret is not in bcrypt format! Format:", {
        length: originalSecret?.length,
        prefix: originalSecret?.substring(0, 30),
        looksLikeHex: /^[0-9a-f]+$/i.test(originalSecret?.substring(0, 20) || ''),
      });
      // This account might have been created with a different method
      // We'll still try to update it with bcrypt, but it might not work
    }
    
    // IMPORTANT: Convex Auth might be using a different bcrypt implementation
    // or doing additional processing. Instead of trying to match the exact format,
    // we'll use bcryptjs.hashSync to ensure consistency, and try both async and sync
    // methods to see which one works
    
    // Try using hashSync first (more deterministic)
    let hashedPassword: string;
    if (bcrypt.hashSync) {
      hashedPassword = bcrypt.hashSync(args.newPassword, 10);
      console.log("Using bcrypt.hashSync");
    } else {
      hashedPassword = await bcrypt.hash(args.newPassword, 10);
      console.log("Using bcrypt.hash (async)");
    }
    
    // Log the hash format for debugging
    console.log("Generated hash prefix:", hashedPassword.substring(0, 10));
    console.log("Original secret prefix:", originalSecret?.substring(0, 10));
    console.log("Original was bcrypt format:", isOriginalBcrypt);
    
    // Verify the hash works by comparing
    const isValid = await bcrypt.compare(args.newPassword, hashedPassword);
    if (!isValid) {
      throw new Error("Password hash verification failed");
    }
    
    try {
      // Update the account's password hash directly
      // We'll try updating it and see if Convex Auth accepts it
      // If it doesn't work, we'll need to investigate further
      await ctx.runMutation(internal.passwordReset.updateAuthAccountPassword, {
        accountId: args.accountId,
        passwordHash: hashedPassword,
      });
      
      // Wait a moment for the database to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify the update worked by checking the account again
      const updatedAccount = await ctx.runQuery(internal.passwordReset.getAuthAccount, {
        accountId: args.accountId,
      });
      
      if (!updatedAccount) {
        throw new Error("Failed to verify password update");
      }
      
      // Verify the new password hash is stored correctly
      const storedSecret = (updatedAccount as any).secret;
      const secretMatches = storedSecret === hashedPassword;
      
      if (!secretMatches) {
        console.error("Password hash mismatch after update", {
          expected: hashedPassword.substring(0, 20),
          got: storedSecret?.substring(0, 20),
        });
        throw new Error("Password hash was not updated correctly");
      }
      
      // Test that the stored hash can verify the password using the same bcrypt library
      const canVerify = await bcrypt.compare(args.newPassword, storedSecret);
      if (!canVerify) {
        console.error("Stored hash cannot verify password!", {
          hashPrefix: storedSecret?.substring(0, 20),
          passwordLength: args.newPassword.length,
        });
        throw new Error("Stored password hash cannot verify the password");
      }
      
      console.log("Password hash verified successfully with bcrypt.compare");
      console.log("Password updated successfully. User should be able to sign in with new password.");
      
      // Mark the reset token as used only after successful password update
      await ctx.runMutation(internal.passwordReset.markResetAsUsed, {
        resetId: args.resetId,
      });
      
      return { 
        success: true,
        message: "Password has been reset successfully. Please sign in with your new password."
      };
    } catch (error) {
      // If password update fails, don't mark token as used
      // Log the error for debugging
      console.error("Failed to update password in action:", error);
      throw error;
    }
  },
});

