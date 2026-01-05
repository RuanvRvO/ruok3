"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import Image from "next/image";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";

export default function VerifyRequired() {
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const { signOut } = useAuthActions();

  const currentUser = useQuery(api.users.getCurrentUser);
  const currentUserId = useQuery(api.users.getCurrentUserId);
  const sendVerificationEmail = useMutation(api.emailVerification.sendVerificationEmail);

  // Countdown timer effect
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds(cooldownSeconds - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownSeconds]);

  const handleResend = async () => {
    if (!currentUserId) {
      setError("You must be signed in to resend verification email");
      return;
    }

    setResending(true);
    setError(null);
    setMessage(null);

    try {
      const result = await sendVerificationEmail({ userId: currentUserId });
      setMessage(result.message || "Verification email sent!");
      // Start 60 second cooldown
      setCooldownSeconds(60);
    } catch (err: any) {
      setError(err?.message?.toString() || "Failed to send verification email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = "/signin";
    } catch (err) {
      // Silently handle sign out error
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
      <div className="text-center flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
          Email Verification Required
        </h1>
        <div className="flex items-center gap-6">
          <Image
            src="/smile.png"
            alt="Smile Logo"
            width={95}
            height={95}
          />
          <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image
            src="/sad.png"
            alt="Sad Logo"
            width={90}
            height={90}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <h2 className="text-amber-900 dark:text-amber-200 font-semibold text-base mb-2">
            Please Verify Your Email
          </h2>
          <p className="text-slate-700 dark:text-slate-300 text-sm mb-3">
            You need to verify your email address before accessing your account.
          </p>
          {currentUser?.email && (
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
              A verification email was sent to: <span className="font-semibold text-slate-800 dark:text-slate-200">{currentUser.email}</span>
            </p>
          )}
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Please check your inbox and click the verification link to continue.
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <p className="text-slate-700 dark:text-slate-300 text-sm mb-2 font-medium">
            Didn't receive the email?
          </p>
          <ul className="text-slate-600 dark:text-slate-400 text-xs space-y-1 mb-3 list-disc list-inside">
            <li>Check your spam or junk folder</li>
            <li>Wait a few minutes for the email to arrive</li>
            <li>Make sure you're checking the correct email address</li>
          </ul>
          <button
            onClick={handleResend}
            disabled={resending || cooldownSeconds > 0}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resending
              ? "Sending..."
              : cooldownSeconds > 0
                ? `Resend available in ${cooldownSeconds}s`
                : "Resend verification email"}
          </button>
        </div>

        {message && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-4">
            <p className="text-rose-700 dark:text-rose-300 font-medium text-sm break-words">
              {error}
            </p>
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm text-center transition-colors underline underline-offset-2"
        >
          Sign out and use a different account
        </button>
      </div>

      <Link
        href="/"
        className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm transition-colors underline underline-offset-2"
      >
        ← Back to Homepage
      </Link>
    </div>
  );
}
