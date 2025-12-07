"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import Image from "next/image";

export default function InvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const invitation = useQuery(api.managerInvitations.getInvitationByToken, token ? { token } : "skip");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-4">
            Invalid Invitation
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            This invitation link is invalid or missing.
          </p>
        </div>
      </div>
    );
  }

  if (invitation === undefined) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (!invitation || invitation.isExpired) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-4">
            Invitation Expired
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            This invitation has expired. Please request a new one.
          </p>
        </div>
      </div>
    );
  }

  // Invitations can be reused - only check if expired
  // Removed check for status !== "pending" to allow multiple people to use the same invitation

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
      // Check if email exists in users table
      const response = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error("Failed to check email");
      }

      const data = await response.json();
      const emailExists = data.exists;

      // Always redirect to accept-invitation page - it will handle signup/signin flow
      // Pass email as query param so accept-invitation can use it if invitation doesn't have email set
      router.push(`/accept-invitation?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      console.error("Error checking email:", err);
      setError(err.message || "Failed to check email. Please try again.");
      setLoading(false);
    }
  };

  const roleDisplay = invitation.role === "viewer" ? "View Only" : "Can Edit";

  return (
    <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
      <div className="text-center flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
          You&apos;ve Been Invited!
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
            You&apos;ve been invited to join
          </p>
          <p className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
            {invitation.organisation}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Access Level: {roleDisplay}
          </p>
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
            {loading ? "Checking..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

