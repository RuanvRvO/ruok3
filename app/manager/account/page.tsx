"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

export default function AccountSettingsPage() {
  const user = useQuery(api.users.getCurrentUser);
  const updateAccount = useMutation(api.users.updateAccount);

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [originalValues, setOriginalValues] = useState({
    name: "",
    surname: "",
    organisation: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Populate form when user data loads
  useEffect(() => {
    if (user) {
      const firstName = user.name || "";
      const lastName = user.surname || "";
      const org = user.organisation || "";

      setName(firstName);
      setSurname(lastName);
      setOrganisation(org);

      // Store original values
      setOriginalValues({
        name: firstName,
        surname: lastName,
        organisation: org,
      });
    }
  }, [user]);

  // Check if form has been modified
  const hasChanges =
    name !== originalValues.name ||
    surname !== originalValues.surname ||
    organisation !== originalValues.organisation;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await updateAccount({
        name: name.trim(),
        surname: surname.trim(),
        organisation,
      });
      setSuccess("Account settings updated successfully!");

      // Update original values after successful save
      setOriginalValues({
        name,
        surname,
        organisation,
      });
    } catch (err: any) {
      setError(err.message || "Failed to update account settings");
    } finally {
      setIsSubmitting(false);
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
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
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
            <label
              htmlFor="organisation"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Organization Name
            </label>
            <input
              type="text"
              id="organisation"
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              placeholder="Acme Inc."
              required
            />
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

      {/* Password Change Section */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-2">
          Password
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Password changes are not currently supported. Contact support if you need to reset your password.
        </p>
      </div>
    </div>
  );
}
