"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Save, Trash2, AlertTriangle } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function AccountSettingsPage() {
  const user = useQuery(api.users.getCurrentUser);
  const organizations = useQuery(api.organizationMemberships.getUserOrganizations);
  const updateAccount = useMutation(api.users.updateAccount);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [originalValues, setOriginalValues] = useState({
    name: "",
    surname: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Populate form when user data loads
  useEffect(() => {
    if (user) {
      const firstName = user.name || "";
      const lastName = user.surname || "";

      setName(firstName);
      setSurname(lastName);

      // Store original values
      setOriginalValues({
        name: firstName,
        surname: lastName,
      });
    }
  }, [user]);

  // Check if form has been modified
  const hasChanges =
    name !== originalValues.name ||
    surname !== originalValues.surname;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    if (!name.trim() || !surname.trim()) {
      setError("Name and surname cannot be empty");
      setIsSubmitting(false);
      return;
    }

    try {
      await updateAccount({
        name: name.trim(),
        surname: surname.trim(),
      });
      setSuccess("Account settings updated successfully!");

      // Update original values after successful save
      setOriginalValues({
        name,
        surname,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update account settings";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount({});
      await signOut();
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete account";
      setDeleteError(message);
      setIsDeleting(false);
    }
  };

  if (user === undefined) {
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

  if (!user) {
    return (
      <div className="mx-auto">
        <p className="text-slate-600 dark:text-slate-400">
          Please sign in to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <div>
        <h1 className="font-bold text-3xl text-slate-900 dark:text-slate-100 mb-3">
          Account Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Update your account details and organization information.
        </p>
      </div>

      {/* Account Details Form */}
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-6">
          Personal Information
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                First Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder="John"
                required
              />
            </div>
            <div>
              <label
                htmlFor="surname"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                Last Name
              </label>
              <input
                type="text"
                id="surname"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Organization Memberships
            </label>
            {organizations && organizations.length > 0 ? (
              <div className="space-y-2">
                {organizations.map((org) => (
                  <div
                    key={org._id}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 flex items-center justify-between"
                  >
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {org.organisation}
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
                        ? "Editor"
                        : "Viewer"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-500">
                No organizations
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Organization membership is managed by organization owners
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={user.email || ""}
              disabled
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Email address cannot be changed
            </p>
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
            disabled={isSubmitting || !hasChanges}
            className="bg-slate-700 hover:bg-slate-800 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="size-4" />
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
          {!hasChanges && !success && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Make changes to enable the save button
            </p>
          )}
        </form>
      </div>

      {/* Danger Zone */}
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-red-200 dark:border-red-900/50 rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-xl text-red-600 dark:text-red-400 mb-2">
          Danger Zone
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <Button
          type="button"
          onClick={() => {
            setDeleteConfirmText("");
            setDeleteError(null);
            setShowDeleteDialog(true);
          }}
          className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
        >
          <Trash2 className="size-4" />
          Delete Account
        </Button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isDeleting && setShowDeleteDialog(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                  Delete your account?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  This will permanently remove your account, all organization memberships, and login credentials. <strong>This cannot be undone.</strong>
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Type <span className="font-mono font-bold text-red-600 dark:text-red-400">I am sure</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="I am sure"
                disabled={isDeleting}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 disabled:opacity-50"
                autoFocus
              />
            </div>

            {deleteError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "I am sure" || isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="size-4" />
                {isDeleting ? "Deleting..." : "Delete Account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
