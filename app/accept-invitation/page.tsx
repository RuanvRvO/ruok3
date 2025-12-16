"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";

export default function AcceptInvitation() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const emailFromQuery = searchParams.get("email");
  const { signIn, signOut } = useAuthActions();

  const { isAuthenticated } = useConvexAuth();
  const invitation = useQuery(api.managerInvitations.getInvitationByToken, token ? { token } : "skip");
  // Always prefer email from query params (user-entered) over invitation email
  // Invitation email may be from a previous user since invitations are reusable
  const emailToCheck = emailFromQuery || invitation?.email || "";
  const emailExists = useQuery(
    api.users.checkEmailExists,
    emailToCheck ? { email: emailToCheck } : "skip"
  );
  const acceptInvitationForExistingUser = useMutation(api.managerInvitations.acceptInvitationForExistingUser);
  const acceptInvitation = useMutation(api.managerInvitations.acceptInvitation);
  const sendVerificationEmail = useMutation(api.emailVerification.sendVerificationEmail);
  const currentUserId = useQuery(api.users.getCurrentUserId);
  const currentUser = useQuery(api.users.getCurrentUser);
  const userOrganizations = useQuery(api.organizationMemberships.getUserOrganizations);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [isSignupMode, setIsSignupMode] = useState(true); // Default to signup
  const signInErrorRef = useRef(false); // Ref to track sign-in errors (for use in closures)
  const [signingOut, setSigningOut] = useState(false); // Track if we're signing out
  const isSigningUpRef = useRef(false); // Track if we're currently in signup process
  const [waitingForAuth, setWaitingForAuth] = useState(false); // Track if we're waiting for auth after signup
  const pendingTokenRef = useRef<string | null>(null); // Store token while waiting for auth

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      router.push("/signin");
    }
  }, [token, router]);

  // Set signup mode based on whether email exists
  useEffect(() => {
    if (emailExists !== undefined && emailToCheck) {
      setIsSignupMode(!emailExists);
    }
  }, [emailExists, emailToCheck]);

  // Update loading message when auth becomes ready (for immediate feedback)
  useEffect(() => {
    if (waitingForAuth && currentUserId && isAuthenticated && loadingMessage === "Getting things setup...") {
      setLoadingMessage("Completing setup...");
    }
  }, [waitingForAuth, currentUserId, isAuthenticated, loadingMessage]);

  // Automatically continue invitation acceptance when auth becomes ready after signup
  useEffect(() => {
    // Only run if we're waiting for auth and have a token
    if (!waitingForAuth || !pendingTokenRef.current || !token) {
      return;
    }

    // Check if we now have a userId
    if (currentUserId && isAuthenticated) {
      // Auth is ready! Continue with invitation acceptance
      // Clear the waiting flag immediately to prevent duplicate runs
      setWaitingForAuth(false);
      const tokenToUse = pendingTokenRef.current;
      pendingTokenRef.current = null;
      
      // Clear loading message immediately to show progress
      setLoadingMessage("Completing setup...");
      
      // Automatically accept the invitation
      const continueInvitation = async () => {
        try {
          await acceptInvitation({ token: tokenToUse, userId: currentUserId as Id<"users"> });
          setLoadingMessage(null);
          
          // Continue with the rest of the flow (redirect, etc.)
          // Wait for organizations query to update after accepting invitation
          setLoadingMessage("Finalizing access...");
          let orgs: Array<{ organisation: string }> | undefined = undefined;
          const initialCount = userOrganizations?.length || 0;
          
          // Wait longer for the query to update - database might need time to propagate
          // Poll for up to 20 seconds (40 iterations * 500ms)
          for (let i = 0; i < 40; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (userOrganizations) {
              const currentCount = userOrganizations.length;
              if (currentCount > initialCount || currentCount >= 1) {
                orgs = userOrganizations;
                break;
              }
            }
          }
          
          if (!orgs && userOrganizations) {
            orgs = userOrganizations;
          }
          
          // If still no orgs after waiting, the membership was created but query hasn't updated yet
          // In this case, just redirect - the membership exists in the database
          // The user will see their organization when they get to the manager page
          if (!orgs || orgs.length === 0) {
            console.log("Organization membership created but query hasn't updated yet. Redirecting anyway - membership exists in database.");
            // Don't show error - just redirect and let the manager page handle it
            // The membership is in the database, the query just needs more time
            setLoadingMessage(null);
            setLoading(false);
            isSigningUpRef.current = false;
            router.push("/manager/view");
            return;
          }
          
          const org = orgs[0];
          localStorage.setItem("selectedOrganization", org.organisation);
          isSigningUpRef.current = false;
          router.push("/manager/view");
        } catch (invitationError: unknown) {
          const errorMessage = invitationError instanceof Error ? invitationError.message : String(invitationError);
          console.error("Failed to accept invitation:", invitationError);
          setLoadingMessage(null);
          setError(`Failed to accept invitation: ${errorMessage}. Please try again or contact support.`);
          setLoading(false);
          isSigningUpRef.current = false;
          setWaitingForAuth(false);
        }
      };
      
      continueInvitation();
    }
  }, [currentUserId, isAuthenticated, token, acceptInvitation, userOrganizations, router, waitingForAuth]);

  // Force sign out if user is authenticated and trying to create a new account
  // This prevents session contamination where the wrong user ID gets used
  useEffect(() => {
    // Skip if we're already signing out, loading, or currently in the signup process
    if (signingOut || !invitation || isSigningUpRef.current) {
      return;
    }

    // If user is authenticated and in signup mode, check if it's for a different email
    if (isAuthenticated && isSignupMode && currentUser?.email) {
      const expectedEmail = emailToCheck.toLowerCase().trim();
      const currentEmail = currentUser.email.toLowerCase().trim();

      // If the authenticated user's email doesn't match the expected email
      if (expectedEmail && expectedEmail !== currentEmail) {
        // Force sign out to prevent creating membership for wrong user
        setSigningOut(true);
        setError(`You are currently signed in as ${currentUser.email}. You will be signed out to create an account for ${emailToCheck}.`);

        // Sign out after a brief delay to show the message
        setTimeout(() => {
          void signOut().then(() => {
            setSigningOut(false);
            setError(null);
          });
        }, 2000);
      }
    }
  }, [isAuthenticated, isSignupMode, currentUser, emailToCheck, signOut, signingOut]);

  // Global error handler to catch uncaught errors from signIn
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorMessage = event.reason?.message || String(event.reason || "");
      const errorString = errorMessage.toLowerCase();
      
      // Only handle if it's a sign-in related error and we're on this page
      if (errorString.includes("invalidsecret") || errorString.includes("invalid credentials") || errorString.includes("invalidaccountid") || errorString.includes("server error")) {
        event.preventDefault(); // Prevent default error handling and page refresh
        event.stopPropagation(); // Stop event from bubbling
        signInErrorRef.current = true;

        // Use setTimeout to ensure state updates happen
        setTimeout(() => {
          if (errorString.includes("invalidsecret") || errorString.includes("invalid credentials") || errorString.includes("server error")) {
            setError("Incorrect password. Please try again.");
          } else if (errorString.includes("invalidaccountid")) {
            setIsSignupMode(true);
            setError("No authentication account found. Please create an account using the form below.");
          }
          setLoading(false);
        }, 0);
      }
    };

    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.message || String(event.error || "");
      const errorString = errorMessage.toLowerCase();
      
      // Check for sign-in errors in the error message
      if (errorString.includes("invalidsecret") || errorString.includes("invalid credentials") || errorString.includes("server error")) {
        event.preventDefault();
        event.stopPropagation();
        signInErrorRef.current = true;

        setTimeout(() => {
          setError("Incorrect password. Please try again.");
          setLoading(false);
        }, 0);
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  // Automatic continuation when authentication is ready (for both new signups AND existing user sign-ins)
  useEffect(() => {
    if (!waitingForAuth || !pendingTokenRef.current || !token) {
      return;
    }

    if (currentUserId && isAuthenticated) {
      setWaitingForAuth(false);
      const tokenToUse = pendingTokenRef.current;
      pendingTokenRef.current = null;

      const continueInvitation = async () => {
        try {
          // Check if this is for a new user (signup) or existing user (signin)
          // If user already exists and has email, use acceptInvitationForExistingUser
          // Otherwise use acceptInvitation for new users
          const isExistingUser = currentUser?.email !== undefined;
          
          if (isExistingUser) {
            setLoadingMessage("Adding you to the organization...");
            const result = await acceptInvitationForExistingUser({ token: tokenToUse });
            
            // Check if user already has access
            if (result?.alreadyHasAccess) {
              const roleDisplayName = result.existingRole === "owner" ? "Owner" : 
                                     result.existingRole === "editor" ? "Editor" : "Viewer";
              setLoadingMessage(null);
              setLoading(false);
              setWaitingForAuth(false);
              setError(`You already have ${roleDisplayName} access to this organization.`);
              return;
            }
            
            // For existing users, wait for organizations query to update
            setLoadingMessage("Finalizing access...");
            let orgs: Array<{ organisation: string }> | undefined = undefined;
            const initialCount = userOrganizations?.length || 0;
            
            // Poll until organizations have updated
            for (let i = 0; i < 100; i++) { // 100 * 200ms = 20 seconds max
              await new Promise(resolve => setTimeout(resolve, 200));
              if (userOrganizations) {
                const currentCount = userOrganizations.length;
                if (currentCount > initialCount || currentCount >= 1) {
                  orgs = userOrganizations;
                  break;
                }
              }
            }
            
            // If still no orgs, use current query result
            if (!orgs && userOrganizations) {
              orgs = userOrganizations;
            }
            
            // Auto-select first organization if available
            if (orgs && orgs.length > 0) {
              const org = orgs[0];
              localStorage.setItem("selectedOrganization", org.organisation);
            }
            
            // Show success message before redirecting
            setLoadingMessage(null);
            setSuccessMessage(`Successfully joined ${invitation.organisation}!`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            setSuccessMessage(null);
            router.push("/manager/view");
          } else {
            // New user signup flow
            setLoadingMessage("Completing setup...");
            await acceptInvitation({ token: tokenToUse, userId: currentUserId as Id<"users"> });
            
            // Wait for organizations query to update
            setLoadingMessage("Finalizing access...");
            let orgs: Array<{ organisation: string }> | undefined = undefined;
            const initialCount = userOrganizations?.length || 0;
            
            for (let i = 0; i < 40; i++) {
              await new Promise(resolve => setTimeout(resolve, 500));
              if (userOrganizations) {
                const currentCount = userOrganizations.length;
                if (currentCount > initialCount || currentCount >= 1) {
                  orgs = userOrganizations;
                  break;
                }
              }
            }
            
            if (!orgs && userOrganizations) {
              orgs = userOrganizations;
            }
            
            if (!orgs || orgs.length === 0) {
              console.log("Organization membership created but query hasn't updated yet. Redirecting anyway.");
              isSigningUpRef.current = false;
              setLoadingMessage(null);
              router.push("/manager/view");
              return;
            }
            
            const org = orgs[0];
            localStorage.setItem("selectedOrganization", org.organisation);
            isSigningUpRef.current = false;
            setLoadingMessage(null);
            router.push("/manager/view");
          }
        } catch (err: unknown) {
          console.error("Failed to accept invitation automatically:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          const lower = errorMessage.toLowerCase();
          const isNetwork = lower.includes("network") || lower.includes("fetch");
          setError(
            errorMessage ||
              (isNetwork
                ? "Network error while completing setup. Please check your connection and try again."
                : "Failed to complete setup. Please try again or sign in manually, then accept the invitation.")
          );
          setLoading(false);
          setLoadingMessage(null);
        }
      };
      continueInvitation();
    }
  }, [currentUserId, isAuthenticated, waitingForAuth, token, currentUser, acceptInvitationForExistingUser, acceptInvitation, userOrganizations, router]);

  if (!token || invitation === undefined || emailExists === undefined) {
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

  // Only check if invitation is expired - allow reuse of invitations
  if (!invitation || invitation.isExpired) {
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
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    setLoading(true);
    setError(null);

    try {
      // Validate invitation BEFORE creating account to prevent orphaned accounts
      if (!invitation) {
        setError("Invalid invitation");
        setLoading(false);
        return;
      }

      // Only check if expired - invitations can be reused by multiple people
      if (invitation.expiresAt < Date.now()) {
        setError("This invitation has expired");
        setLoading(false);
        return;
      }

      // Use email from query params if invitation doesn't have email
      const emailToUse = invitation?.email || emailFromQuery || "";
      if (!emailToUse) {
        setError("Email is required. Please go back and enter your email.");
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.set("email", emailToUse);
      formData.set("password", password);

      if (isSignupMode) {
        // Sign up mode
        // Check if email already exists - if so, switch to signin mode
        if (emailExists === true) {
          setError("An account with this email already exists. Please sign in instead.");
          setIsSignupMode(false);
          setLoading(false);
          return;
        }
        
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

        formData.set("flow", "signUp");
        if (name) {
          formData.set("name", name);
        }
        if (surname) {
          formData.set("surname", surname);
        }

        // CRITICAL: Clear selected organization before signup
        // This prevents the manager/view page from signing us out during the signup process
        // if it gets navigated to before the membership is created
        if (typeof window !== "undefined") {
          localStorage.removeItem("selectedOrganization");
        }

        // Set flag to indicate we're in the signup process
        // This prevents the session contamination check from firing during signup
        isSigningUpRef.current = true;

        // Now create the account - only after all validations pass
        let newUserId: Id<"users"> | null = null;
        try {
          await signIn("password", formData);

          // Wait for account to be created and get userId
          setLoadingMessage("Creating your account...");
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Temporarily sign in to get the user ID for sending verification email
          const signInFormData = new FormData();
          signInFormData.set("email", emailToUse);
          signInFormData.set("password", password);
          signInFormData.set("flow", "signIn");

          try {
            await signIn("password", signInFormData);
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (currentUserId) {
              newUserId = currentUserId;
            }
          } catch (signInError) {
            console.log("Could not auto sign-in to send verification:", signInError);
          }
        } catch (signUpError: unknown) {
          // Handle case where account already exists
          const errorMessage = signUpError instanceof Error ? signUpError.message : String(signUpError);
          const errorLower = errorMessage.toLowerCase();

          if (errorLower.includes("already exists") || errorLower.includes("account with this email")) {
            setError("An account with this email already exists. Please sign in instead.");
            setIsSignupMode(false);
            isSigningUpRef.current = false;
            setLoading(false);
            return;
          }
          // Re-throw other errors
          throw signUpError;
        }

        // Send verification email if we have userId
        if (newUserId) {
          try {
            setLoadingMessage("Sending verification email...");
            await sendVerificationEmail({
              userId: newUserId as Id<"users">,
            });
          } catch (emailError) {
            console.error("Failed to send verification email:", emailError);
            // Continue anyway - user can request it again
          }
        }

        // Sign out the user - they need to verify email first
        setLoadingMessage("Finalizing account creation...");
        try {
          await signOut();
        } catch (signOutError) {
          console.log("Sign out error:", signOutError);
        }

        // Reset signup flag
        isSigningUpRef.current = false;
        setLoading(false);
        setLoadingMessage(null);

        // Redirect to check-email page
        router.push(`/check-email?email=${encodeURIComponent(emailToUse)}`);
        return; // Exit early - user needs to verify email before accepting invitation
      } else {
        // Sign in mode
        formData.set("flow", "signIn");
        signInErrorRef.current = false; // Reset error flag
        
        // Use the same pattern as signin page - void with catch/then chain
        // Wrap in try-catch to catch any synchronous errors
        try {
          void signIn("password", formData)
            .catch((signInError: unknown) => {
              // Handle sign in errors - set error and stop
              const errorMessage = signInError instanceof Error ? signInError.message : String(signInError);
              const errorString = errorMessage.toLowerCase();
              
              signInErrorRef.current = true; // Set flag to prevent navigation
              
              // Use setTimeout to ensure state updates happen even if page tries to redirect
              setTimeout(() => {
                if (errorString.includes("invalidaccountid")) {
                  setIsSignupMode(true);
                  setError("No authentication account found. Please create an account using the form below.");
                } else if (errorString.includes("invalidsecret") || errorString.includes("invalid credentials") || errorString.includes("server error")) {
                  setError("Incorrect password. Please try again.");
                } else {
                  const isNetwork = errorString.includes("network") || errorString.includes("fetch");
                  setError(
                    isNetwork
                      ? "Network error during sign in. Please check your connection and try again."
                      : "Sign in failed. Please check your password and try again."
                  );
                }
                setLoading(false);
              }, 0);
            })
          .then(async () => {
            // Only runs if sign in was successful AND no error flag is set
            if (signInErrorRef.current) {
              return; // Don't proceed if there was an error
            }
            
            // Wait for authentication to be fully established before calling mutation
            // The mutation requires authentication, so we need to ensure it's ready
            // IMPORTANT: React query values are captured in closure, so wait fixed time initially
            setLoadingMessage("Verifying access...");
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds initially
            
            let userId: string | null = currentUserId || null;

            if (!userId) {
              // Auth not ready yet - set flags and let useEffect automatically continue when ready
              setWaitingForAuth(true);
              pendingTokenRef.current = token;
              // Keep loading state active - don't clear loading or loadingMessage
              // The useEffect will automatically continue when currentUserId becomes available
              return; // Exit early - useEffect will handle continuation automatically
            }
            
            // Auth is ready, continue with invitation acceptance
            setLoadingMessage("Adding you to the organization...");
            
            try {
              // For existing users, use acceptInvitationForExistingUser (checks email matching)
              const result = await acceptInvitationForExistingUser({ token });
              
              // Check if user already has access
              if (result?.alreadyHasAccess) {
                const roleDisplayName = result.existingRole === "owner" ? "Owner" : 
                                       result.existingRole === "editor" ? "Editor" : "Viewer";
                setLoadingMessage(null);
                setError(`You already have ${roleDisplayName} access to this organization.`);
                setLoading(false);
                return;
              }
              
              // After accepting invitation, wait for organizations query to update
              // Poll until we get the updated organization list
              let orgs: Array<{ organisation: string }> | undefined = undefined;
              const initialCount = userOrganizations?.length || 0;
              
              // Wait for the query to update (should show one more organization than before)
              for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 200));
                // Check if organizations have updated (count increased or we have at least 1)
                if (userOrganizations) {
                  const currentCount = userOrganizations.length;
                  // If count increased or we now have at least 1 org, use it
                  if (currentCount > initialCount || currentCount >= 1) {
                    orgs = userOrganizations;
                    break;
                  }
                }
              }
              
              // If still no orgs, try one more time with the current query result
              if (!orgs && userOrganizations) {
                orgs = userOrganizations;
              }
              
              // Auto-select first organization if available, then redirect to manager view
              if (orgs && orgs.length > 0) {
                const org = orgs[0];
                localStorage.setItem("selectedOrganization", org.organisation);
              }
              // Show success message before redirecting
              setLoadingMessage(null);
              setSuccessMessage(`Successfully joined ${invitation.organisation}!`);
              await new Promise(resolve => setTimeout(resolve, 1500));
              setSuccessMessage(null);
              router.push("/manager/view");
            } catch (err: unknown) {
              const errorMessage = err instanceof Error ? err.message : String(err);
              const lower = errorMessage.toLowerCase();
              const isNetwork = lower.includes("network") || lower.includes("fetch");
              setError(
                errorMessage ||
                  (isNetwork
                    ? "Network error while accepting the invitation. Please retry."
                    : "Failed to accept invitation. Please try again or contact support.")
              );
              setLoading(false);
            }
          });
        } catch (syncError: unknown) {
          // Catch any synchronous errors
          const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);
          const errorString = errorMessage.toLowerCase();
          
          signInErrorRef.current = true;
          
          setTimeout(() => {
            if (errorString.includes("invalidsecret") || errorString.includes("invalid credentials") || errorString.includes("server error")) {
              setError("Incorrect password. Please try again.");
            } else {
              const isNetwork = errorString.includes("network") || errorString.includes("fetch");
              setError(
                isNetwork
                  ? "Network error during sign in. Please check your connection and try again."
                  : "Sign in failed. Please check your password and try again."
              );
            }
            setLoading(false);
          }, 0);
        }
        
        // Return early to prevent outer try-catch from continuing
        return;
      }

      // For signup mode, handle redirect after accepting invitation
      // After accepting invitation, wait for organizations query to update
      // Poll until we get the updated organization list
      setLoadingMessage("Finalizing access...");
      let orgs: Array<{ organisation: string }> | undefined = undefined;
      const initialCount = userOrganizations?.length || 0;
      
      // Wait longer for the query to update - database might need time to propagate
      // Poll for up to 20 seconds (40 iterations * 500ms)
      for (let i = 0; i < 40; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        // Check if organizations have updated (count increased or we have at least 1)
        if (userOrganizations) {
          const currentCount = userOrganizations!.length;
          // If count increased or we now have at least 1 org, use it
          if (currentCount > initialCount || currentCount >= 1) {
            orgs = userOrganizations;
            break;
          }
        }
      }
      
      // If still no orgs, try one more time with the current query result
      if (!orgs && userOrganizations) {
        orgs = userOrganizations;
      }
      
      // If still no orgs after waiting, the membership was created but query hasn't updated yet
      // In this case, just redirect - the membership exists in the database
      // The user will see their organization when they get to the manager page
      if (!orgs || orgs!.length === 0) {
        console.log("Organization membership created but query hasn't updated yet. Redirecting anyway - membership exists in database.");
        // Don't throw error - just redirect and let the manager page handle it
        // The membership is in the database, the query just needs more time
        isSigningUpRef.current = false;
        setLoadingMessage(null);
        router.push("/manager/view");
        return;
      }

      // Auto-select first organization if available, then redirect to manager view
      const org = orgs![0];
      localStorage.setItem("selectedOrganization", org.organisation);

      // Reset signup flag before redirecting
      isSigningUpRef.current = false;

      // Always redirect to manager view (sidebar will show all orgs)
      router.push("/manager/view");
    } catch (err: unknown) {
      // Reset signup flag on error
      isSigningUpRef.current = false;

      // Handle other errors (not signin errors, those are handled above)
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorString = errorMessage.toLowerCase();

      if (errorString.includes("invalidsecret") || errorString.includes("invalid credentials") || errorString.includes("server error")) {
        setError("Incorrect password. Please try again.");
      } else if (errorString.includes("invalidaccountid")) {
        setError("Account not found. Please use the signup form below.");
      } else {
        setError(
          emailExists
            ? "Sign in failed. Please check your password and try again."
            : "Account creation failed. Please try again."
        );
      }
      setLoading(false);
    }
  };

  return (
    <>
      {/* Full-screen loading overlay */}
      {loadingMessage && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full mx-4">
            <div className="flex flex-col items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-4 sm:gap-6">
                <Image src="/smile.png" alt="Smile Logo" width={60} height={60} className="w-12 h-12 sm:w-14 sm:h-14 md:w-[60px] md:h-[60px]" />
                <div className="w-px h-12 sm:h-14 md:h-16 bg-slate-300 dark:bg-slate-600"></div>
                <Image src="/sad.png" alt="Sad Logo" width={55} height={55} className="w-11 h-11 sm:w-13 sm:h-13 md:w-[55px] md:h-[55px]" />
              </div>
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }}></div>
                  <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }}></div>
                </div>
                <p className="text-slate-800 dark:text-slate-200 font-semibold text-lg text-center">
                  {loadingMessage}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-sm text-center">
                  This may take a moment...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success overlay */}
      {successMessage && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl border border-green-200 dark:border-green-700 max-w-md w-full mx-4">
            <div className="flex flex-col items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-4 sm:gap-6">
                <Image src="/smile.png" alt="Success" width={80} height={80} className="w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20" />
              </div>
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-slate-800 dark:text-slate-200 font-semibold text-lg text-center">
                  {successMessage}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-sm text-center">
                  Redirecting to dashboard...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-6 sm:py-8">
        <div className="text-center flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200">Accept Invitation</h1>
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
          {isSignupMode ? (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
              Create an account with email <span className="font-semibold">{emailToCheck}</span> to accept this invitation.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                An account with email <span className="font-semibold">{emailToCheck}</span> already exists.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Please sign in to accept this invitation and add access to your account.
              </p>
            </>
          )}
        </div>
      </div>
      <form
        className="flex flex-col gap-4 w-full bg-slate-100 dark:bg-slate-800 p-4 sm:p-6 md:p-8 rounded-2xl shadow-xl border border-slate-300 dark:border-slate-600"
        onSubmit={handleSubmit}
      >
        <input
          className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 cursor-not-allowed opacity-60"
          type="email"
          value={emailToCheck}
          disabled
        />
        {isSignupMode && (
          <>
            <input
              className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Name"
              required
            />
            <input
              className="bg-white dark:bg-slate-900 text-foreground rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400"
              type="text"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              placeholder="Last Name"
              required
            />
          </>
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
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-4">
            <p className="text-rose-700 dark:text-rose-300 font-medium text-sm break-words">{error}</p>
          </div>
        )}
        <button
          className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-3 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          type="submit"
          disabled={loading || loadingMessage !== null || invitation === undefined || signingOut}
        >
          {signingOut
            ? "Signing Out..."
            : loadingMessage
            ? "Please wait..."
            : loading
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
              setName("");
              setSurname("");
              // Reset signup flag when switching modes
              isSigningUpRef.current = false;
            }}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 underline underline-offset-2"
          >
            {isSignupMode ? "Already have an account? Sign in" : "Don't have an account? Create one"}
          </button>
        </div>
      </form>
      <Link
        href="/signin"
        className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm transition-colors underline underline-offset-2"
      >
        ← Back to Sign In
      </Link>
    </div>
    </>
  );
}
