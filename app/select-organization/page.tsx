"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Plus, LogOut } from "lucide-react";

export default function SelectOrganization() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);
  const organizations = useQuery(api.organizationMemberships.getUserOrganizations);
  const createOrganization = useMutation(api.organizationMemberships.createOrganization);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [authLoading, isAuthenticated, router]);

  // If user has exactly one organization, redirect directly to dashboard
  // (0 orgs = stay on page to create one, 1 org = redirect, 2+ orgs = stay to choose)
  useEffect(() => {
    // Only run if we have loaded organizations (not undefined) and user is authenticated
    if (authLoading || !isAuthenticated || organizations === undefined) {
      return;
    }
    
    // Only redirect if we have exactly 1 organization
    if (organizations.length === 1) {
      const org = organizations[0];
      const currentSelected = localStorage.getItem("selectedOrganization");
      
      // Only redirect if the org isn't already selected (prevents loops)
      if (currentSelected !== org.organisation) {
        localStorage.setItem("selectedOrganization", org.organisation);
        // Small delay to ensure localStorage is set
        const timeoutId = setTimeout(() => {
          router.push("/manager/view");
        }, 50);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [organizations, router, authLoading, isAuthenticated]);

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

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await createOrganization({ name: orgName.trim() });
      // After creation, the organization will appear in the list
      // and the useEffect will redirect if it's the only one
      setShowCreateForm(false);
      setOrgName("");
    } catch (err: any) {
      setError(err.message || "Failed to create organization");
    } finally {
      setCreating(false);
    }
  };

  const handleSelectOrganization = (org: typeof organizations[0]) => {
    // Store the selected organization
    localStorage.setItem("selectedOrganization", org.organisation);
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
          {organizations.length === 0 ? "Welcome!" : "Select Organization"}
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          {organizations.length === 0
            ? "Create an organization to get started"
            : "Choose an organization to access"}
        </p>
      </div>

      {organizations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {organizations.map((org) => (
            <button
              key={org._id}
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
      )}

      {/* Create Organization Button/Form */}
      {!showCreateForm ? (
        <Button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
        >
          <Plus className="size-4" />
          Create New Organization
        </Button>
      ) : (
        <form
          onSubmit={handleCreateOrganization}
          className="w-full bg-slate-100 dark:bg-slate-800 p-6 rounded-xl border border-slate-300 dark:border-slate-600"
        >
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
            Create Organization
          </h2>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization Name"
            className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mb-4"
            required
            autoFocus
          />
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={creating || !orgName.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setOrgName("");
                setError(null);
              }}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Sign Out Button */}
      <button
        onClick={() =>
          void signOut().then(() => {
            // Clear organization selection from localStorage
            localStorage.removeItem("selectedOrganization");
            router.push("/signin");
          })
        }
        className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors mt-4"
      >
        <LogOut className="size-4" />
        <span>Sign Out</span>
      </button>
    </div>
  );
}
