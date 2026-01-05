"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import Image from "next/image";
import Link from "next/link";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const requestPasswordReset = useMutation(api.passwordReset.requestPasswordReset);

  // Countdown timer effect
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds(cooldownSeconds - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    try {
      const result = await requestPasswordReset({ email: email.toLowerCase().trim() });
      setSuccess(result.message || "If an account with this email exists, a password reset link has been sent.");
      // Start 60 second cooldown
      setCooldownSeconds(60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const isNetwork = msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch");
      setError(
        msg ||
          (isNetwork
            ? "Network error while requesting a reset link. Check your connection and try again."
            : "Could not request a reset link. Please try again shortly.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
      <div className="text-center flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200">
          R u OK Website
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

          <Image
            src="/nextjs-icon-dark-background.svg"
            alt="Next.js Logo"
            width={90}
            height={90}
            className="hidden dark:block w-14 h-14 sm:w-18 sm:h-18 md:w-[90px] md:h-[90px]"
          />
        </div>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
          Reset your password
        </p>
      </div>

      <form
        className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-4 sm:p-6 md:p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600"
        onSubmit={handleSubmit}
      >
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
        <input
          className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <button
          className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-3 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          type="submit"
          disabled={loading || cooldownSeconds > 0}
        >
          {loading
            ? "Sending..."
            : cooldownSeconds > 0
              ? `Resend available in ${cooldownSeconds}s`
              : "Send Reset Link"}
        </button>
        <Link
          href="/signin"
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm text-center transition-colors underline underline-offset-2"
        >
          ← Back to Sign In
        </Link>
        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-4">
            <p className="text-rose-700 dark:text-rose-300 font-medium text-sm break-words">
              {error}
            </p>
          </div>
        )}
      </form>
      <Link
        href="/"
        className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm transition-colors underline underline-offset-2"
      >
        ← Back to Homepage
      </Link>
    </div>
  );
}

