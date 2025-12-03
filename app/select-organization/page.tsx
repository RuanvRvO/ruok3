"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useConvexAuth } from "convex/react";

export default function SelectOrganization() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (currentUser?.email) {
      setEmail(currentUser.email);
    }
  }, [currentUser]);

  const organizations = useQuery(
    api.users.getUserOrganizations,
    email ? { email } : "skip"
  );

  // If user has only one organization, redirect directly
  useEffect(() => {
    if (organizations && organizations.length === 1) {
      const org = organizations[0];
      // Store the selected organization and source
      localStorage.setItem("selectedOrganization", org.organisation);
      localStorage.setItem("selectedSource", org.source);
      router.push("/manager/view");
    }
  }, [organizations, router]);

  if (authLoading || !currentUser || !organizations) {
    return (
      <div className="flex flex-col gap-8 w-full h-screen justify-center items-center px-4">
        <div className="flex items-center gap-6">
          <Image src="/smile.png" alt="Smile Logo" width={90} height={90} />
          <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
          <div
            className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
            style={{ animationDelay: "0.1s" }}
          ></div>
          <div
            className="w-2 h-2 bg-slate-600 rounded-full animate-bounce"
            style={{ animationDelay: "0.2s" }}
          ></div>
          <p className="ml-2 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-lg mx-auto h-screen justify-center items-center px-4">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="flex items-center gap-6">
            <Image src="/smile.png" alt="Smile Logo" width={95} height={95} />
            <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
            No Organizations Found
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            You don't have access to any organizations yet.
          </p>
        </div>
      </div>
    );
  }

  const handleSelectOrganization = (org: typeof organizations[0]) => {
    // Store the selected organization and source
    localStorage.setItem("selectedOrganization", org.organisation);
    localStorage.setItem("selectedSource", org.source);
    router.push("/manager/view");
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto h-screen justify-center items-center px-4">
      <div className="text-center flex flex-col items-center gap-4">
        <div className="flex items-center gap-6">
          <Image src="/smile.png" alt="Smile Logo" width={95} height={95} />
          <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
          Select Organization
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          You have access to multiple organizations. Please select one to continue.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {organizations.map((org, index) => (
          <button
            key={index}
            onClick={() => handleSelectOrganization(org)}
            className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-6 rounded-xl border border-slate-300 dark:border-slate-600 transition-all hover:scale-[1.02] active:scale-[0.98] text-left"
          >
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
              {org.organisation}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Role:
              </span>
              <span
                className={`text-sm font-medium px-2 py-1 rounded ${
                  org.role === "owner"
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : org.role === "editor"
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                }`}
              >
                {org.role === "owner"
                  ? "Owner"
                  : org.role === "editor"
                  ? "Can Edit"
                  : "View Only"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
