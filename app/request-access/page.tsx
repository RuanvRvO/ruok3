"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import Image from "next/image";
import Link from "next/link";

export default function RequestAccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email");

  const invitation = useQuery(api.managerInvitations.getInvitationByToken, token ? { token } : "skip");
  const createAccessRequest = useMutation(api.accessRequests.createAccessRequest);

  const [email, setEmail] = useState(emailParam || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      router.push("/signin");
    }
  }, [token, router]);

  if (!token || invitation === undefined) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
          <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
          <p className="ml-2 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!invitation || invitation.isExpired) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="flex items-center gap-6">
            <Image src="/smile.png" alt="Smile Logo" width={95} height={95} />
            <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-4">
            Invitation Expired
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            This invitation has expired. Please request a new one from your organization administrator.
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

  // If this is an email-specific invitation, redirect to accept-invitation
  if (invitation.invitationType === "email") {
    router.push(`/accept-invitation?token=${token}`);
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    try {
      await createAccessRequest({
        invitationId: invitation._id,
        requestedEmail: email.toLowerCase().trim(),
      });

      // Redirect to signin page with message (new flow)
      const params = new URLSearchParams({
        email: email.toLowerCase().trim(),
        message: "access_requested",
        org: invitation.organisation,
      });
      router.push(`/signin?${params.toString()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to submit access request. Please try again.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
        <div className="text-center flex flex-col items-center gap-6">
          <div className="flex items-center gap-6">
            <Image
              src="/smile.png"
              alt="Success"
              width={120}
              height={120}
            />
          </div>

          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
            Request Submitted!
          </h1>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 w-full">
            <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed">
              Your access request to <span className="font-semibold">{invitation.organisation}</span> has been sent to the organization owner.
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-4">
              You&apos;ll receive an email at <span className="font-semibold">{email}</span> when your request is reviewed.
            </p>
          </div>

          <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            <p>The organization owner will review your request and either approve or decline it.</p>
            <p className="mt-2">If approved, you&apos;ll be able to create an account and access the organization.</p>
          </div>
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

  const roleDisplay = invitation.role === "viewer" ? "View Only" : "Can Edit";

  return (
    <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
      <div className="text-center flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
          Request Access
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
            src="/smile.png"
            alt="Smile Logo"
            width={95}
            height={95}
          />
        </div>
      </div>

      <div className="w-full bg-slate-100 dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600">
        <div className="text-center mb-6">
          <p className="text-slate-600 dark:text-slate-400 mb-2">
            You&apos;re requesting access to
          </p>
          <p className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
            {invitation.organisation}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Access Level: {roleDisplay}
          </p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-lg mb-6 text-sm">
          <p className="font-semibold mb-1">⚠️ Approval Required</p>
          <p>The organization owner will need to approve your request before you can access this organization.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Enter your email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
              className="w-full bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              You&apos;ll receive an email when your request is reviewed
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-3 shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting..." : "Submit Access Request"}
          </button>
        </form>
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
