"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Component that checks if the current user needs email verification
 * and redirects them to the verification required page if needed.
 *
 * Use this component on protected pages to enforce email verification.
 */
export function VerificationGuard({ children }: { children: React.ReactNode }) {
  const needsVerification = useQuery(api.users.needsEmailVerification);
  const router = useRouter();

  useEffect(() => {
    if (needsVerification === true) {
      router.push("/verify-required");
    }
  }, [needsVerification, router]);

  // While checking verification status, show loading or nothing
  if (needsVerification === undefined) {
    return null; // or a loading spinner
  }

  // If verification is needed, don't render children (redirect is happening)
  if (needsVerification === true) {
    return null;
  }

  // User is verified or grandfathered in - render the protected content
  return <>{children}</>;
}
