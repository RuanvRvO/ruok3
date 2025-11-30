"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function ManagerSignUp() {
  const { signIn } = useAuthActions();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const invitation = useQuery(api.managerInvitations.getInvitationByToken, token ? { token } : "skip");
  const acceptInvitation = useMutation(api.managerInvitations.acceptInvitation);
  const currentUser = useQuery(api.users.getCurrentUser);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
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

  // Accept invitation after user is authenticated
  useEffect(() => {
    const handleInvitationAcceptance = async () => {
      if (accountCreated && currentUser && token && invitation && !invitation.isExpired) {
        try {
          await acceptInvitation({ token, userId: currentUser._id });
          router.push("/manager/view");
        } catch (err: any) {
          setError(err.message || "Failed to accept invitation");
          setLoading(false);
          setAccountCreated(false);
        }
      }
    };

    void handleInvitationAcceptance();
  }, [accountCreated, currentUser, token, invitation, acceptInvitation, router]);

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

  if (!invitation || invitation.isExpired || invitation.status !== "pending") {
    return (
      <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="flex items-center gap-6">
            <Image src="/smile.png" alt="Smile Logo" width={95} height={95} />
            <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">Invalid or Expired Invitation</h1>
          <p className="text-slate-600 dark:text-slate-400">
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

    try {
      // Create the password auth account
      const signupFormData = new FormData();
      signupFormData.set("email", invitation.email);
      signupFormData.set("name", formData.name);
      signupFormData.set("surname", formData.surname);
      signupFormData.set("password", formData.password);
      signupFormData.set("flow", "signUp");

      await signIn("password", signupFormData);

      // Mark account as created - the useEffect will handle accepting the invitation and redirecting
      setAccountCreated(true);
    } catch (err: any) {
      setError(err.message || "Failed to create account");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
      <div className="text-center flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">Complete Your Signup</h1>
        <div className="flex items-center gap-6">
          <Image src="/smile.png" alt="Smile Logo" width={95} height={95} />
          <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-slate-600 dark:text-slate-400">
            You've been invited to <span className="font-semibold text-slate-800 dark:text-slate-200">{invitation.organisation}</span>
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Access Level: {invitation.role === "viewer" ? "View Only" : "Can Edit"}
          </p>
        </div>
      </div>
      <form
        className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600"
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
          disabled={loading || accountCreated}
        >
          {accountCreated ? "Setting up your account..." : loading ? "Creating Account..." : "Create Account"}
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
