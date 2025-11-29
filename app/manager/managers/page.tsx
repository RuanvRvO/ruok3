"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, UserPlus } from "lucide-react";

export default function ManageManagersPage() {
  const user = useQuery(api.users.getCurrentUser);
  const managers = useQuery(api.users.listManagers);
  const addManager = useMutation(api.users.addManager);
  const removeManager = useMutation(api.users.removeManager);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await addManager({ email, name });
      setEmail("");
      setName("");
      setSuccess("Manager invitation sent successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to add manager");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveManager = async (userId: string) => {
    if (!confirm("Are you sure you want to remove this manager's access?")) {
      return;
    }

    try {
      await removeManager({ userId });
      setSuccess("Manager removed successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to remove manager");
    }
  };

  if (user === undefined || managers === undefined) {
    return (
      <div className="mx-auto">
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

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <div>
        <h1 className="font-bold text-3xl text-slate-900 dark:text-slate-100 mb-3">
          Manage Managers
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Add or remove managers who can view and manage your organization's wellbeing data.
        </p>
      </div>

      {/* Add Manager Form */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <UserPlus className="size-5" />
          Add New Manager
        </h2>
        <form onSubmit={handleAddManager} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              placeholder="John Doe"
              required
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              placeholder="manager@example.com"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg">
              {success}
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-slate-700 hover:bg-slate-800 text-white"
          >
            {isSubmitting ? "Adding..." : "Add Manager"}
          </Button>
        </form>
      </div>

      {/* Current Managers List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-4">
          Current Managers
        </h2>
        {managers.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">
            No additional managers added yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {managers.map((manager) => (
              <div
                key={manager._id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {manager.name}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {manager.email}
                  </p>
                </div>
                {manager._id !== user._id && (
                  <Button
                    onClick={() => handleRemoveManager(manager._id)}
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
