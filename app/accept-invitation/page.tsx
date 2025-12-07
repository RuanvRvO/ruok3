"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";

export default function AcceptInvitation() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const { signIn } = useAuthActions();

  const { isAuthenticated } = useConvexAuth();
  const invitation = useQuery(api.managerInvitations.getInvitationByToken, token ? { token } : "skip");
  const emailExists = useQuery(
    api.users.checkEmailExists,
    invitation ? { email: invitation.email } : "skip"
  );
  const acceptInvitationForExistingUser = useMutation(api.managerInvitations.acceptInvitationForExistingUser);
  const acceptInvitation = useMutation(api.managerInvitations.acceptInvitation);
  const currentUser = useQuery(api.users.getCurrentUser);
  const currentUserId = useQuery(api.users.getCurrentUserId);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignupMode, setIsSignupMode] = useState(true); // Default to signup

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      router.push("/signin");
    }
  }, [token, router]);

  if (!token || invitation === undefined || emailExists === undefined) {
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

    try {
      const formData = new FormData();
      formData.set("email", invitation.email);
      formData.set("password", password);

      if (isSignupMode) {
        // Sign up mode
        if (password !== confirmPassword) {
          setError("Passwords do not match");
          setLoading(false);
          return;
        }
        formData.set("flow", "signUp");
        if (name) {
          formData.set("name", name);
        }
        await signIn("password", formData);
        
        // For new users, wait for authentication and get the user ID
        // Poll for currentUserId to be available (it will update after signup)
        let userId: string | null = null;
        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 200));
          // Check if user is authenticated and currentUserId is available
          if (isAuthenticated && currentUserId) {
            userId = currentUserId;
            break;
          }
        }
        
        if (!userId) {
          throw new Error("Failed to get user ID after signup. Please refresh the page and try again.");
        }
        
        // Use acceptInvitation for new users (doesn't check email matching)
        await acceptInvitation({ token, userId: userId as any });
      } else {
        // Sign in mode
        formData.set("flow", "signIn");
        try {
          await signIn("password", formData);
        } catch (signInError: any) {
          // If sign in fails with InvalidAccountId, switch to signup
          if (signInError.message?.includes("InvalidAccountId")) {
            setIsSignupMode(true);
            setError("No authentication account found. Please create an account using the form below.");
            setLoading(false);
            return;
          } else {
            throw signInError;
          }
        }
        
        // For existing users, use acceptInvitationForExistingUser (checks email matching)
        await acceptInvitationForExistingUser({ token });
      }

      // Redirect to organization selection
      router.push("/select-organization");
    } catch (err: any) {
      const errorMessage = err.message || "";
      if (errorMessage.includes("InvalidSecret") || errorMessage.includes("Invalid credentials")) {
        setError("Incorrect password. Please try again.");
      } else if (errorMessage.includes("InvalidAccountId")) {
        setError("Account not found. Please use the signup form below.");
      } else {
        setError(err.message || (emailExists ? "Failed to sign in. Please check your password." : "Failed to create account. Please try again."));
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
      <div className="text-center flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">Accept Invitation</h1>
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
          {isSignupMode ? (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
              Create an account with email <span className="font-semibold">{invitation.email}</span> to accept this invitation.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                An account with email <span className="font-semibold">{invitation.email}</span> already exists.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Please sign in to accept this invitation and add access to your account.
              </p>
            </>
          )}
        </div>
      </div>
      <form
        className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600"
        onSubmit={handleSubmit}
      >
        <input
          className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 cursor-not-allowed opacity-60"
          type="email"
          value={invitation.email}
          disabled
        />
        {isSignupMode && (
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full Name (optional)"
          />
        )}
        <div className="flex flex-col gap-1">
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            minLength={8}
            required
          />
        </div>
        {isSignupMode && (
          <div className="flex flex-col gap-1">
            <input
              className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              minLength={8}
              required
            />
          </div>
        )}
        <button
          className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-3 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          type="submit"
          disabled={loading || invitation === undefined}
        >
          {loading 
            ? (isSignupMode ? "Creating Account..." : "Signing In...") 
            : (isSignupMode ? "Create Account & Accept Invitation" : "Sign In & Accept Invitation")}
        </button>
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignupMode(!isSignupMode);
              setError(null);
              setPassword("");
              setConfirmPassword("");
            }}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 underline underline-offset-2"
          >
            {isSignupMode ? "Already have an account? Sign in" : "Don't have an account? Create one"}
          </button>
        </div>
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
