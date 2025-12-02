"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, UserPlus, Mail, Eye, Edit2, Clock, CheckCircle, XCircle } from "lucide-react";

export default function ManageManagersPage() {
  const user = useQuery(api.users.getCurrentUser);
  const managers = useQuery(api.users.listManagers);
  const invitations = useQuery(api.managerInvitations.listInvitations);
  const createInvitation = useMutation(api.managerInvitations.createInvitation);
  const updateManagerRole = useMutation(api.managerInvitations.updateManagerRole);
  const removeManager = useMutation(api.users.removeManager);
  const revokeInvitation = useMutation(api.managerInvitations.revokeInvitation);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await createInvitation({ email, role });

      setEmail("");
      setRole("viewer");
      setSuccess(`Invitation email sent successfully to ${email}! They'll receive a link to set up their account.`);
    } catch (err: any) {
      setError(err.message || "Failed to create invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRole = async (managerId: Id<"users">, currentRole: "viewer" | "editor") => {
    const newRole = currentRole === "viewer" ? "editor" : "viewer";
    try {
      await updateManagerRole({ managerId, role: newRole });
      setSuccess(`User role updated to ${newRole}`);
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    }
  };

  const handleRemoveManager = async (userId: Id<"users">) => {
    if (!confirm("Are you sure you want to remove this user's access?")) {
      return;
    }

    try {
      await removeManager({ userId });
      setSuccess("User removed successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to remove user");
    }
  };

  const handleRevokeInvitation = async (invitationId: Id<"managerInvitations">) => {
    if (!confirm("Are you sure you want to revoke this invitation?")) {
      return;
    }

    try {
      await revokeInvitation({ invitationId });
      setSuccess("Invitation revoked successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to revoke invitation");
    }
  };

  const copyInviteLink = (token: string) => {
    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}/manager-signup?token=${token}`;
    navigator.clipboard.writeText(inviteLink);
    setSuccess("Invitation link copied to clipboard!");
  };

  if (user === undefined || managers === undefined || invitations === undefined) {
    return (
      <div className="mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
          <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
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

  const isOwner = user.role === "owner";
  const activeManagers = managers.filter((m) => m._id !== user._id);
  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <div>
        <h1 className="font-bold text-3xl text-slate-900 dark:text-slate-100 mb-3">
          Viewer Access
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Invite users to view or edit your organization's wellbeing data.
        </p>
      </div>

      {!isOwner && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-lg">
          Only organization owners can manage viewer access.
        </div>
      )}

      {/* Add Manager Form */}
      {isOwner && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <UserPlus className="size-5" />
            Invite New User
          </h2>
          <form onSubmit={handleSendInvitation} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder="user@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Access Level
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value="viewer"
                    checked={role === "viewer"}
                    onChange={(e) => setRole(e.target.value as "viewer")}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <Eye className="size-4" />
                      <span className="font-medium">View Only</span>
                    </div>
                    <span className="text-xs text-slate-500">Can view dashboard only</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value="editor"
                    checked={role === "editor"}
                    onChange={(e) => setRole(e.target.value as "editor")}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <Edit2 className="size-4" />
                      <span className="font-medium">Can Edit</span>
                    </div>
                    <span className="text-xs text-slate-500">Can view and edit organization</span>
                  </div>
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg break-all">
                {success}
              </div>
            )}

            <Button type="submit" disabled={isSubmitting} className="bg-slate-700 hover:bg-slate-800 text-white">
              {isSubmitting ? "Sending Email..." : "Send Invitation Email"}
            </Button>
          </form>
        </div>
      )}

      {/* Pending Invitations */}
      {isOwner && pendingInvitations.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Mail className="size-5" />
            Pending Invitations
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Invitation emails have been sent. You can copy the link again if needed.
          </p>
          <div className="flex flex-col gap-3">
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation._id}
                className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{invitation.email}</p>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-1">
                    <Clock className="size-3" />
                    <span>
                      {invitation.role === "viewer" ? "View Only" : "Can Edit"} • Expires{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => copyInviteLink(invitation.token)}
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Copy Link
                  </Button>
                  <Button
                    onClick={() => handleRevokeInvitation(invitation._id)}
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Managers */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-4">Active Users</h2>
        {activeManagers.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">No additional users yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {activeManagers.map((manager) => (
              <div
                key={manager._id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {manager.name || manager.email}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{manager.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {isOwner && manager.role !== "owner" ? (
                    <Button
                      onClick={() => handleToggleRole(manager._id, manager.role as "viewer" | "editor")}
                      variant="outline"
                      size="sm"
                      className={
                        manager.role === "editor"
                          ? "border-green-500 text-green-700 dark:text-green-400"
                          : "border-blue-500 text-blue-700 dark:text-blue-400"
                      }
                    >
                      {manager.role === "viewer" ? (
                        <>
                          <Eye className="size-4 mr-1" /> View Only
                        </>
                      ) : (
                        <>
                          <Edit2 className="size-4 mr-1" /> Can Edit
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400 px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded">
                      Owner
                    </span>
                  )}
                  {isOwner && manager.role !== "owner" && (
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
