//add function for other managers to view organization details without edit rights (sign in as manager but read-only) and maybe other super users also
//have 1 butt

"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const searchParams = useSearchParams();
  const initialFlow = searchParams.get("flow") === "signup" ? "signUp" : "signIn";
  const isViewerMode = searchParams.get("viewer") === "true";
  const successMessage = searchParams.get("success") === "account_created";

  const [flow, setFlow] = useState<"signIn" | "signUp">(initialFlow);
  const [viewerMode, setViewerMode] = useState(isViewerMode);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const signInViewer = useMutation(api.viewers.signInViewer);

  // Show success message when redirected from signup
  useEffect(() => {
    if (successMessage && viewerMode) {
      setSuccess("Account created successfully! Please sign in.");
    }
  }, [successMessage, viewerMode]);
  return (
    <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
      <div className="text-center flex flex-col items-center gap-4">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
                 R u OK Website
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
            src="/sad.png"
            alt="Sad Logo"
            width={90}
            height={90}
          />
          
         
          <Image
            src="/nextjs-icon-dark-background.svg"
            alt="Next.js Logo"
            width={90}
            height={90}
            className="hidden dark:block"
          />
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          {viewerMode
            ? "Sign in to your viewer account."
            : flow === "signIn"
            ? "Sign in here to access your account."
            : "Create a new account to get started."}
        </p>

      </div>
      {/* Mode selector */}
      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
        <button
          type="button"
          onClick={() => setViewerMode(false)}
          className={`px-4 py-2 rounded-md transition-all ${
            !viewerMode
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          Organization Owner
        </button>
        <button
          type="button"
          onClick={() => {
            setViewerMode(true);
            setFlow("signIn");
          }}
          className={`px-4 py-2 rounded-md transition-all ${
            viewerMode
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          Viewer Access
        </button>
      </div>
      <form
        className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          setSuccess(null);
          const formData = new FormData(e.target as HTMLFormElement);

          // Handle viewer sign-in separately
          if (viewerMode) {
            const email = formData.get("email") as string;
            const password = formData.get("password") as string;

            try {
              const viewer = await signInViewer({ email, password });
              // Store viewer session in localStorage
              localStorage.setItem("viewerSession", JSON.stringify(viewer));
              router.push("/viewer/dashboard");
            } catch (err: any) {
              setError(err.message || "Failed to sign in");
              setLoading(false);
            }
            return;
          }

          // Regular organization owner authentication
          // Check if passwords match during sign up
          if (flow === "signUp") {
            const password = formData.get("password") as string;
            const confirmPassword = formData.get("confirmPassword") as string;
            if (password !== confirmPassword) {
              setError("Passwords do not match");
              setLoading(false);
              return;
            }

            // IMPORTANT: Check if email already exists before allowing signup
            const email = formData.get("email") as string;
            try {
              const response = await fetch("/api/check-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });

              if (response.ok) {
                const data = await response.json();
                if (data.exists) {
                  setError("This email is already registered. Please sign in instead.");
                  setLoading(false);
                  return;
                }
              }
            } catch (err) {
              console.error("Email check error:", err);
              // Don't fail silently - block signup if we can't verify
              setError("Unable to verify email. Please try again.");
              setLoading(false);
              return;
            }
          }

          formData.set("flow", flow);
          void signIn("password", formData)
            .catch((error) => {
              // Extract the actual error from Convex's error wrapper
              const errorMessage = error.message;

              // Check for specific authentication errors and show user-friendly messages
              if (errorMessage.includes("InvalidSecret") || errorMessage.includes("Invalid credentials")) {
                setError("Incorrect email or password");
              } else if (errorMessage.includes("InvalidAccountId")) {
                setError("Account not found");
              } else if (errorMessage.includes("TooManyFailedAttempts")) {
                setError("Too many failed attempts. Please try again later");
              } else if (errorMessage.includes("Account with this email already exists") || errorMessage.includes("already exists")) {
                setError("An account with this email already exists. Please sign in instead or use the organization manager to add more organizations.");
              } else {
                // For any other errors, show a generic message
                setError("An error occurred. Please try again");
              }

              setLoading(false);
            })
            .then(() => {
              router.push("/manager/view");
            });
        }}
      >
        {flow === "signUp" && !viewerMode && (
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="text"
            name="name"
            placeholder="Name"
            required
          />
        )}
        {flow === "signUp" && !viewerMode && (
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="text"
            name="surname"
            placeholder="Surname"
            required
          />
        )}
        {flow === "signUp" && !viewerMode && (
          <input
            className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
            type="text"
            name="organisation"
            placeholder="Organisation"
            required
          />
        )}
        <input
          className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
          type="email"
          name="email"
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
            ? "Loading..."
            : viewerMode
            ? "Sign in as Viewer"
            : flow === "signIn"
            ? "Sign in"
            : "Create Organisation"}
        </button>
        {!viewerMode && (
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
        )}
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
