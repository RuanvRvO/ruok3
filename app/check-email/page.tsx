"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function CheckEmail() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const resendVerificationEmail = useMutation(api.emailVerification.resendVerificationEmail);

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
    if (!email) {
      setError("Email address is required");
      return;
    }

    setResending(true);
    setError(null);
    setMessage(null);

    try {
      const result = await resendVerificationEmail({ email });
      setMessage(result.message || "Verification email sent!");
      // Start 60 second cooldown
      setCooldownSeconds(60);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send verification email. Please try again.";
      setError(message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
      <div className="text-center flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200">
          Check Your Email
        </h1>
        <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
          <Image
            src="/smile.png"
            alt="Smile Logo"
            width={95}
            height={95}
            className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24"
          />
          <div className="w-px h-12 sm:h-16 md:h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image
            src="/sad.png"
            alt="Sad Logo"
            width={90}
            height={90}
            className="w-14 h-14 sm:w-18 sm:h-18 md:w-[90px] md:h-[90px]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-4 sm:p-6 md:p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-slate-700 dark:text-slate-300 font-medium text-sm mb-3">
            We&apos;ve sent a verification email to:
          </p>
          {email && (
            <p className="text-slate-900 dark:text-slate-100 font-semibold text-base mb-3">
              {email}
            </p>
          )}
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Please check your inbox and click the verification link to activate your account.
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <p className="text-slate-700 dark:text-slate-300 text-sm mb-2 font-medium">
            Didn&apos;t receive the email?
          </p>
          <ul className="text-slate-600 dark:text-slate-400 text-xs space-y-1 mb-3 list-disc list-inside">
            <li>Check your spam or junk folder</li>
            <li>Make sure you entered the correct email address</li>
            <li>Wait a few minutes for the email to arrive</li>
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

        <Link
          href="/signin"
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm text-center transition-colors underline underline-offset-2"
        >
          ← Back to Sign In
        </Link>
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
