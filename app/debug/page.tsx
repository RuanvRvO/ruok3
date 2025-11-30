"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function DebugPage() {
  const user = useQuery(api.users.getCurrentUser);
  const setOrganization = useMutation(api.users.setOrganization);
  const [orgName, setOrgName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSetOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await setOrganization({ organisation: orgName.trim() });
      alert("Organization set successfully! Redirecting to view page...");
      router.push("/manager/view");
    } catch (err: any) {
      setError(err.message || "Failed to set organization");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Debug User Data</h1>

      <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg overflow-auto mb-8">
        {JSON.stringify(user, null, 2)}
      </pre>

      {user && !user.organisation && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-100 mb-4">
            Organization Missing!
          </h2>
          <p className="text-amber-800 dark:text-amber-200 mb-4">
            Your account doesn't have an organization set. Please enter your organization name below to fix this:
          </p>

          <form onSubmit={handleSetOrganization} className="flex flex-col gap-3">
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Enter your organization name"
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              required
            />

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting ? "Setting..." : "Set Organization"}
            </Button>
          </form>
        </div>
      )}

      {user && user.organisation && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-green-900 dark:text-green-100 mb-2">
            ✓ Organization Set
          </h2>
          <p className="text-green-800 dark:text-green-200">
            Organization: <strong>{user.organisation}</strong>
          </p>
          <p className="text-green-800 dark:text-green-200">
            Role: <strong>{user.role || "Not set"}</strong>
          </p>
          <Button
            onClick={() => router.push("/manager/view")}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white"
          >
            Go to Dashboard
          </Button>
        </div>
      )}
    </div>
  );
}
