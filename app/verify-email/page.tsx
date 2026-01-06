"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function VerifyEmail() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const verifyToken = useQuery(
    api.emailVerification.verifyToken,
    token ? { token } : "skip"
  );
  const verifyEmail = useMutation(api.emailVerification.verifyEmail);

  useEffect(() => {
    if (token && verifyToken && !verifyToken.valid && !verifying && !success) {
      setError(verifyToken.message || "Invalid or expired verification token");
    }
  }, [token, verifyToken, verifying, success]);

  const handleVerify = async () => {
    if (!token) {
      setError("No verification token provided");
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const result = await verifyEmail({ token });
      setSuccess(result.message || "Email verified successfully!");

      // Check if invitation was already accepted (user created account via invitation link)
      const invitationAccepted = typeof window !== "undefined" ? localStorage.getItem("invitationAccepted") : null;

      // Check if there's a pending invitation token in localStorage (old flow, kept for backwards compatibility)
      const pendingToken = typeof window !== "undefined" ? localStorage.getItem("pendingInvitationToken") : null;
      const pendingEmail = typeof window !== "undefined" ? localStorage.getItem("pendingInvitationEmail") : null;

      // Clear the stored data
      if (typeof window !== "undefined") {
        localStorage.removeItem("invitationAccepted");
        localStorage.removeItem("pendingInvitationToken");
        localStorage.removeItem("pendingInvitationEmail");
      }

      // Redirect based on invitation status
      setTimeout(() => {
        if (invitationAccepted) {
          // Invitation was already accepted, go directly to dashboard
          router.push("/manager/view");
        } else if (pendingToken && pendingEmail) {
          // Old flow: redirect to accept-invitation page
          router.push(`/accept-invitation?token=${encodeURIComponent(pendingToken)}&email=${encodeURIComponent(pendingEmail)}`);
        } else {
          // No invitation, go to sign in
          router.push("/signin");
        }
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to verify email. Please try again or request a new verification link.";
      setError(message);
    } finally {
      setVerifying(false);
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
        <div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-4">
          <p className="text-rose-700 dark:text-rose-300 font-medium text-sm">
            No verification token provided. Please use the link from your email.
          </p>
        </div>
        <Link
          href="/signin"
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm transition-colors underline underline-offset-2"
        >
          ← Back to Sign In
        </Link>
      </div>
    );
  }

  if (verifyToken === undefined) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
        <p className="text-slate-600 dark:text-slate-400">Verifying token...</p>
      </div>
    );
  }

  if (success) {
    // Check if invitation was accepted to show correct redirect message
    const invitationAccepted = typeof window !== "undefined" ? localStorage.getItem("invitationAccepted") : null;

    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
        <div className="text-center flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
            <Image src="/smile.png" alt="Smile Logo" width={95} height={95} className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24" />
            <div className="w-px h-12 sm:h-16 md:h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image src="/sad.png" alt="Sad Logo" width={90} height={90} className="w-14 h-14 sm:w-18 sm:h-18 md:w-[90px] md:h-[90px]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200">
            Email Verified!
          </h1>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg">
          {success}
          <p className="text-sm mt-2">
            {invitationAccepted ? "Redirecting to your dashboard..." : "Redirecting to sign in..."}
          </p>
        </div>
      </div>
    );
  }

  if (verifyToken && !verifyToken.valid) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
        <div className="text-center flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
            <Image src="/smile.png" alt="Smile Logo" width={95} height={95} className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24" />
            <div className="w-px h-12 sm:h-16 md:h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image src="/sad.png" alt="Sad Logo" width={90} height={90} className="w-14 h-14 sm:w-18 sm:h-18 md:w-[90px] md:h-[90px]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200">
            Verification Failed
          </h1>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-4">
          <p className="text-rose-700 dark:text-rose-300 font-medium text-sm">
            {verifyToken.message || "Invalid or expired verification token"}
          </p>
        </div>
        <Link
          href="/signin"
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm transition-colors underline underline-offset-2"
        >
          ← Back to Sign In
        </Link>
      </div>
    );
  }

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
        </div>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
          Verify your email address
        </p>
        {verifyToken.email && (
          <p className="text-slate-500 dark:text-slate-500 text-sm">
            Verifying email for: {verifyToken.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-4 sm:p-6 md:p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600">
        <button
          className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-3 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          onClick={handleVerify}
          disabled={verifying}
        >
          {verifying ? "Verifying..." : "Verify Email Address"}
        </button>
        <Link
          href="/signin"
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm text-center transition-colors underline underline-offset-2"
        >
          ← Back to Sign In
        </Link>
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-4">
            <p className="text-rose-700 dark:text-rose-300 font-medium text-sm break-words">
              {error}
            </p>
          </div>
        )}
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
