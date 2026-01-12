"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function SignIn() {
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const searchParams = useSearchParams();
  const initialFlow = searchParams.get("flow") === "signup" ? "signUp" : "signIn";
  const successMessage = searchParams.get("success") === "account_created";
  const returnTo = searchParams.get("returnTo");
  const invitationToken = searchParams.get("token");
  const invitationEmail = searchParams.get("email");
  const messageType = searchParams.get("message");
  const orgName = searchParams.get("org");
  const organizations = useQuery(api.organizationMemberships.getUserOrganizations);
  const [flow, setFlow] = useState<"signIn" | "signUp">(initialFlow);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [email, setEmail] = useState(invitationEmail || "");
  const emailExists = useQuery(
    api.users.checkEmailExists,
    email && email.trim().length > 0 ? { email: email.trim() } : "skip"
  );
  const router = useRouter();
  const signInErrorRef = useRef(false); // Track if sign-in failed to prevent redirect
  const [waitingForAuth, setWaitingForAuth] = useState(false);

  // Show success message when redirected from signup
  useEffect(() => {
    if (successMessage) {
      setSuccess("Account created successfully! Please sign in.");
    }
  }, [successMessage]);

  // If there's an invitation token, redirect to accept-invitation page
  // The accept-invitation page handles the full invitation flow
  useEffect(() => {
    if (invitationToken) {
      const emailParam = invitationEmail ? `&email=${encodeURIComponent(invitationEmail)}` : "";
      router.push(`/accept-invitation?token=${encodeURIComponent(invitationToken)}${emailParam}`);
    }
  }, [invitationToken, invitationEmail, router]);

  // Automatic continuation when authentication is ready
  useEffect(() => {
    if (!waitingForAuth || !loading) {
      return;
    }

    if (isAuthenticated) {
      setWaitingForAuth(false);
      setLoadingMessage(null);

      const continueSignIn = async () => {
        try {
          // If user has organizations, auto-select the first one
          if (organizations && organizations.length > 0) {
            const org = organizations[0];
            localStorage.setItem("selectedOrganization", org.organisation);
          }

          // Always redirect to manager view (sidebar will show all orgs)
          router.push("/manager/view");
        } catch (err) {
          const message =
            (err as Error)?.message?.toString().trim() ||
            "Failed to complete sign-in. Please refresh and try again.";
          setError(message);
          setLoading(false);
        }
      };
      continueSignIn();
    }
  }, [isAuthenticated, waitingForAuth, loading, organizations, router]);

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
          {flow === "signIn"
            ? "Sign in to your account"
            : "Create a new account"}
        </p>
      </div>

      {/* Access request confirmation message */}
      {messageType === "access_requested" && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 w-full">
          <p className="text-blue-700 dark:text-blue-300 text-sm">
            Access request submitted for <strong>{orgName || "the organization"}</strong>.
            Please sign in or create an account. You&apos;ll receive an email once your request is approved.
          </p>
        </div>
      )}

      <form
        className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-4 sm:p-6 md:p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          setSuccess(null);
          const formData = new FormData(e.target as HTMLFormElement);

          // Check if passwords match during sign up
          if (flow === "signUp") {
            if (emailExists === true) {
              setError("An account with this email already exists. Please sign in instead.");
              setLoading(false);
              setFlow("signIn");
              return;
            }

            const password = formData.get("password") as string;
            const confirmPassword = formData.get("confirmPassword") as string;
            if (password !== confirmPassword) {
              setError("Passwords do not match");
              setLoading(false);
              return;
            }

            // Validate password length
            if (password.length < 8) {
              setError("Password must be at least 8 characters");
              setLoading(false);
              return;
            }

            // Don't pre-check email - let Convex Auth handle it
            // It will throw an error if the email already exists
          }

          formData.set("flow", flow);
          signInErrorRef.current = false; // Reset error flag
          
          // If signing up and we already have an account (or haven't loaded the check yet), do not proceed.
          if (flow === "signUp" && emailExists !== false) {
            setError("An account with this email already exists. Please sign in instead.");
            setLoading(false);
            setFlow("signIn");
            return;
          }

          void signIn("password", formData)
            .catch((error) => {
              const errorMessage = error?.message ?? "";

              signInErrorRef.current = true; // Set flag to prevent redirect

              if (
                errorMessage.includes("InvalidSecret") ||
                errorMessage.includes("Invalid credentials") ||
                errorMessage.includes("InvalidAccountId") ||
                errorMessage.includes("Server Error")
              ) {
                setError("Incorrect email or password. Please try again.");
              } else if (errorMessage.includes("TooManyFailedAttempts")) {
                setError("Too many failed attempts. Please try again later.");
              } else if (
                errorMessage.includes("Account with this email already exists") ||
                errorMessage.includes("already exists")
              ) {
                setError("An account with this email already exists. Please sign in instead.");
                setFlow("signIn");
              } else {
                const isNetwork =
                  errorMessage.toLowerCase().includes("network") ||
                  errorMessage.toLowerCase().includes("fetch");
                const fallback = isNetwork
                  ? "Network error. Please check your connection and try again."
                  : "Sign in failed. Please check your credentials and try again.";
                setError(fallback);
              }

              setLoading(false);
            })
            .then(async () => {
              // Only redirect if sign-in was successful (no error occurred)
              if (signInErrorRef.current) {
                return; // Don't redirect if there was an error
              }

              // Redirect to returnTo URL if present
              if (returnTo) {
                router.push(returnTo);
                return;
              }

              // Show loading message while waiting for authentication
              setLoadingMessage("Getting your dashboard ready...");

              // Wait a bit initially for authentication to initialize
              await new Promise(resolve => setTimeout(resolve, 2000));

              // If not authenticated yet, set flag to wait for it
              if (!isAuthenticated) {
                setWaitingForAuth(true);
                return; // useEffect will handle the continuation
              }

              // If authenticated, proceed immediately
              setLoadingMessage(null);

              // If user has organizations, auto-select the first one
              if (organizations && organizations.length > 0) {
                const org = organizations[0];
                localStorage.setItem("selectedOrganization", org.organisation);
              }

              // Always redirect to manager view (sidebar will show all orgs)
              router.push("/manager/view");
            });
        }}
      >
        {flow === "signUp" && (
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="text"
            name="name"
            placeholder="Name"
            required
          />
        )}
        {flow === "signUp" && (
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="text"
            name="surname"
            placeholder="Surname"
            required
          />
        )}
        <input
          className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <div className="flex flex-col gap-1">
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="password"
            name="password"
            placeholder="Password"
            minLength={8}
            required
          />
          {flow === "signUp" && (
            <input
              className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              required
            />
          )}
          {flow === "signUp" && (
            <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
              Password must be at least 8 characters
            </p>
          )}
        </div>
        <button
          className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-3 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          type="submit"
          disabled={loading}
        >
          {loading
            ? (loadingMessage || "Loading...")
            : flow === "signIn"
            ? "Sign In"
            : "Sign Up"}
        </button>
        {flow === "signIn" && (
          <Link
            href="/forgot-password"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm mt-1 text-center"
          >
            Forgot password?
          </Link>
        )}
        
        {/* Loading indicator with message */}
        {loading && loadingMessage && (
          <div className="flex items-center justify-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
              <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm">{loadingMessage}</p>
          </div>
        )}
        <div className="flex flex-row gap-2 text-sm justify-center">
          <span className="text-slate-600 dark:text-slate-400">
            {flow === "signIn"
              ? "Don't have an account?"
              : "Already have an account?"}
          </span>
          <span
            className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 font-medium underline decoration-2 underline-offset-2 hover:no-underline cursor-pointer transition-colors"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "Sign up" : "Sign in"}
          </span>
        </div>
        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-4">
            <p className="text-rose-700 dark:text-rose-300 font-medium text-sm break-words">
              Error: {error}
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
