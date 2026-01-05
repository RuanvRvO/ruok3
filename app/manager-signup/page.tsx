"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function ManagerSignUp() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const invitation = useQuery(api.managerInvitations.getInvitationByToken, token ? { token } : "skip");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    surname: "",
    password: "",
    confirmPassword: "",
  });

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      router.push("/signin");
    }
  }, [token, router]);

  // Always redirect to accept-invitation page
  // The accept-invitation page handles both signup and signin flows
  useEffect(() => {
    if (invitation && token) {
      router.push(`/accept-invitation?token=${token}`);
    }
  }, [invitation, token, router]);

  if (!token || invitation === undefined) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
          <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
          <p className="ml-2 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!invitation || invitation.isExpired || invitation.status !== "pending") {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
        <div className="text-center flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
            <Image src="/smile.png" alt="Smile Logo" width={95} height={95} className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24" />
            <div className="w-px h-12 sm:h-16 md:h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image src="/sad.png" alt="Sad Logo" width={90} height={90} className="w-14 h-14 sm:w-18 sm:h-18 md:w-[90px] md:h-[90px]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200">Invalid or Expired Invitation</h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            This invitation link is no longer valid. Please contact your organization owner for a new invitation.
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Check if passwords match
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    if (!invitation) {
      setError("Invalid invitation");
      setLoading(false);
      return;
    }

    try {
      // No longer create viewer - just redirect to signin then accept invitation
      // The user will create their account through normal signup, then accept the invitation
      router.push(`/signin?flow=signup&returnTo=/accept-invitation?token=${token}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const isNetwork = msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch");
      setError(
        msg ||
          (isNetwork
            ? "Network error while redirecting. Please check your connection and try again."
            : "Could not continue signup. Please try again.")
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
      <div className="text-center flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200">Complete Your Signup</h1>
        <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
          <Image src="/smile.png" alt="Smile Logo" width={95} height={95} className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24" />
          <div className="w-px h-12 sm:h-16 md:h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Sad Logo" width={90} height={90} className="w-14 h-14 sm:w-18 sm:h-18 md:w-[90px] md:h-[90px]" />
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            You&apos;ve been invited to <span className="font-semibold text-slate-800 dark:text-slate-200">{invitation.organisation}</span>
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Access Level: {invitation.role === "viewer" ? "View Only" : "Can Edit"}
          </p>
        </div>
      </div>
      <form
        className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-4 sm:p-6 md:p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600"
        onSubmit={handleSubmit}
      >
        <input
          className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="First Name"
          required
        />
        <input
          className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
          type="text"
          value={formData.surname}
          onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
          placeholder="Last Name"
          required
        />
        <input
          className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 cursor-not-allowed opacity-60"
          type="email"
          value={invitation.email}
          disabled
        />
        <div className="flex flex-col gap-1">
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Password"
            minLength={8}
            required
          />
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            placeholder="Confirm Password"
            required
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
            Password must be at least 8 characters
          </p>
        </div>
        <button
          className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-3 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          type="submit"
          disabled={loading}
        >
          {loading ? "Creating Account..." : "Create Account"}
        </button>
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-4">
            <p className="text-rose-700 dark:text-rose-300 font-medium text-sm break-words">Error: {error}</p>
          </div>
        )}
      </form>
      <Link
        href="/signin"
        className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm transition-colors underline underline-offset-2"
      >
        ← Back to Sign In
      </Link>
    </div>
  );
}
