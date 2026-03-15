"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import Image from "next/image";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

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

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      router.push("/signin");
    }
  }, [token, router]);

  if (!token || invitation === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}></div>
        <div className="absolute top-20 left-10 w-64 h-64 bg-green-400/20 dark:bg-green-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex flex-col gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4">
          <LoadingSpinner message="Loading..." />
        </div>
      </div>
    );
  }

  if (!invitation || invitation.isExpired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}></div>
        <div className="absolute top-20 left-10 w-64 h-64 bg-green-400/20 dark:bg-green-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex flex-col gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="flex items-center gap-6">
              <Image src="/smile.png" alt="Smile Logo" width={120} height={120} className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg" />
              <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
              <Image src="/sad.png" alt="Sad Logo" width={120} height={120} className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg" />
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

  const roleDisplay = invitation.role === "viewer" ? "View Only" : "Can Edit";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)`,
        backgroundSize: '24px 24px'
      }}></div>
      
      {/* Decorative Blobs */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-green-400/20 dark:bg-green-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-400/10 dark:bg-purple-500/5 rounded-full blur-3xl"></div>

      <div className="relative z-10 flex flex-col gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4">
        <div className="text-center flex flex-col items-center gap-4">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
            Request Access
          </h1>
          <div className="flex items-center gap-6">
            <Image
              src="/smile.png"
              alt="Smile Logo"
              width={120}
              height={120}
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg"
            />
            <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image
              src="/sad.png"
              alt="Sad Logo"
              width={120}
              height={120}
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg"
            />
          </div>
        </div>

        <div className="w-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-slate-200/50 dark:border-slate-700/50">
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
    </div>
  );
}
