"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, UserPlus, Mail, Eye, Edit2, Clock, AlertTriangle } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useRouter } from "next/navigation";

export default function ManageManagersPage() {
  const user = useQuery(api.users.getCurrentUser);
  const router = useRouter();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  // Get selected organization from localStorage and listen for changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const updateSelectedOrg = () => {
        const org = localStorage.getItem("selectedOrganization");
        setSelectedOrg(org);
      };
      updateSelectedOrg();
      window.addEventListener("organizationChanged", updateSelectedOrg);
      return () => window.removeEventListener("organizationChanged", updateSelectedOrg);
    }
  }, []);

  const userRole = useQuery(
    api.organizationMemberships.getUserRoleInOrg,
    selectedOrg ? { organisation: selectedOrg } : "skip"
  );

  // Handle access denial - clear invalid org and redirect to org selection
  useEffect(() => {
    if (selectedOrg && userRole !== undefined && userRole === null) {
      localStorage.removeItem("selectedOrganization");
      router.push("/select-organization");
    }
  }, [selectedOrg, userRole, router]);

  const members = useQuery(
    api.users.getOrganizationMembersWithDetails,
    selectedOrg && userRole ? { organisation: selectedOrg } : "skip"
  );

  const invitations = useQuery(api.managerInvitations.listInvitations);
  const accessRequests = useQuery(
    api.accessRequests.listAccessRequests,
    selectedOrg && userRole ? { organisation: selectedOrg, status: "pending" } : "skip"
  );
  const createInvitation = useMutation(api.managerInvitations.createInvitation);
  const removeMember = useMutation(api.organizationMemberships.removeOrganizationMember);
  const revokeInvitation = useMutation(api.managerInvitations.revokeInvitation);
  const approveAccessRequest = useMutation(api.accessRequests.approveAccessRequest);
  const declineAccessRequest = useMutation(api.accessRequests.declineAccessRequest);

  const [confirmDialog, setConfirmDialog] = useState<
    | { action: "approve" | "decline"; requestId: Id<"accessRequests">; label: string }
    | { action: "remove"; membershipId: Id<"organizationMemberships">; label: string }
    | { action: "revoke"; invitationId: Id<"managerInvitations">; label: string }
    | null
  >(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const [role, setRole] = useState<"viewer" | "editor">("viewer"); // For email invitations
  const [linkRole, setLinkRole] = useState<"viewer" | "editor">("viewer"); // For shareable links
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);


  const copyInviteUrl = () => {
    if (generatedUrl) {
      navigator.clipboard.writeText(generatedUrl);
      setSuccess("Invitation URL copied to clipboard!");
    }
  };

  const handleRemoveMember = (membershipId: Id<"organizationMemberships">, label: string) => {
    setConfirmDialog({ action: "remove", membershipId, label });
  };

  const handleRevokeInvitation = (invitationId: Id<"managerInvitations">, label: string) => {
    setConfirmDialog({ action: "revoke", invitationId, label });
  };

  const copyInviteLink = (token: string) => {
    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}/invite?token=${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(inviteLink);
    setSuccess("Invitation link copied to clipboard!");
  };

  const handleApproveRequest = (requestId: Id<"accessRequests">, label: string) => {
    setConfirmDialog({ action: "approve", requestId, label });
  };

  const handleDeclineRequest = (requestId: Id<"accessRequests">, label: string) => {
    setConfirmDialog({ action: "decline", requestId, label });
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog) return;
    setIsConfirming(true);
    try {
      if (confirmDialog.action === "approve") {
        await approveAccessRequest({ requestId: confirmDialog.requestId });
        setSuccess("Access request approved! The user will receive an email notification.");
      } else if (confirmDialog.action === "decline") {
        await declineAccessRequest({ requestId: confirmDialog.requestId });
        setSuccess("Access request declined.");
      } else if (confirmDialog.action === "remove") {
        await removeMember({ membershipId: confirmDialog.membershipId });
        setSuccess("User removed successfully!");
      } else if (confirmDialog.action === "revoke") {
        await revokeInvitation({ invitationId: confirmDialog.invitationId });
        setSuccess("Invitation revoked successfully!");
      }
      setConfirmDialog(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to complete action";
      setError(message);
    } finally {
      setIsConfirming(false);
    }
  };

  if (user === undefined || members === undefined || invitations === undefined || accessRequests === undefined || userRole === undefined) {
    return (
      <div className="mx-auto">
        <LoadingSpinner message="Loading..." />
      </div>
    );
  }

  if (!user || !selectedOrg) {
    return (
      <div className="mx-auto">
        <p className="text-slate-600 dark:text-slate-400">
          Please select an organization to view this page.
        </p>
      </div>
    );
  }

  const isOwner = userRole === "owner";
  const activeMembers = members.filter((m) => m.userId !== user._id);
  const now = Date.now();
  const pendingInvitations = invitations.filter(
    (inv) => inv.status === "pending" && inv.organisation === selectedOrg && inv.expiresAt > now
  );

  // Email validation helper
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto px-4">
      <div>
        <h1 className="font-bold text-3xl text-slate-900 dark:text-slate-100 mb-3">
          Member Access
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Invite users to view or edit your organization&apos;s wellbeing data.
        </p>
      </div>

      {!isOwner && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-lg">
          Only organization owners can manage member access.
        </div>
      )}

      {/* Email Invitation Section */}
      {isOwner && (
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-8 shadow-sm">
          <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
            <UserPlus className="size-5" />
            Invite New User
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Type email of user that you want to invite
          </p>

          {error && error.includes("email") && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {success && success.includes("email sent") && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-4 break-all">
              {success}
            </div>
          )}

          <div className="flex flex-col gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Access Level
              </label>
              <div className="flex gap-4">
                <label className="flex items-start gap-3 cursor-pointer flex-1 p-4 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <input
                    type="radio"
                    name="role"
                    value="viewer"
                    checked={role === "viewer"}
                    onChange={(e) => setRole(e.target.value as "viewer")}
                    className="w-4 h-4 mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Eye className="size-4" />
                      <span className="font-medium text-slate-900 dark:text-slate-100">View Only</span>
                    </div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Can view dashboard only</span>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer flex-1 p-4 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <input
                    type="radio"
                    name="role"
                    value="editor"
                    checked={role === "editor"}
                    onChange={(e) => setRole(e.target.value as "editor")}
                    className="w-4 h-4 mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Edit2 className="size-4" />
                      <span className="font-medium text-slate-900 dark:text-slate-100">Can Edit</span>
                    </div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Can view and edit organization</span>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={async () => {
                if (!selectedOrg || !email.trim()) return;

                setIsSubmitting(true);
                setError(null);
                setSuccess(null);
                setGeneratedUrl(null);

                try {
                  const result = await createInvitation({
                    role,
                    organisation: selectedOrg,
                    email: email.trim(),
                    baseUrl: window.location.origin, // Pass current deployment URL
                  });

                  if (result.mode === "email") {
                    setSuccess(`Invitation email sent to ${email}! They'll receive instructions to join.`);
                    setEmail("");
                  }
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Failed to send invitation";
                  setError(message);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              disabled={isSubmitting || !isValidEmail(email)}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold rounded-lg py-3 px-6 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Sending Email..." : "Send Email Invitation"}
            </button>
          </div>
        </div>
      )}

      {/* Generate Invite Link Section */}
      {isOwner && (
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-8 shadow-sm">
          <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-2">
            Generate Invite Code
          </h2>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-lg mb-6 text-sm">
            ⚠️ Anyone with this link can request access to your organization. You will need to approve each request before they gain access.
          </div>

          {error && !error.includes("email") && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {success && !success.includes("email sent") && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-4 break-all">
              {success}
            </div>
          )}

          <div className="flex flex-col gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Access Level for Link
              </label>
              <div className="flex gap-4">
                <label className="flex items-start gap-3 cursor-pointer flex-1 p-4 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <input
                    type="radio"
                    name="role-link"
                    value="viewer"
                    checked={linkRole === "viewer"}
                    onChange={(e) => setLinkRole(e.target.value as "viewer")}
                    className="w-4 h-4 mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Eye className="size-4" />
                      <span className="font-medium text-slate-900 dark:text-slate-100">View Only</span>
                    </div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Can view dashboard only</span>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer flex-1 p-4 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <input
                    type="radio"
                    name="role-link"
                    value="editor"
                    checked={linkRole === "editor"}
                    onChange={(e) => setLinkRole(e.target.value as "editor")}
                    className="w-4 h-4 mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Edit2 className="size-4" />
                      <span className="font-medium text-slate-900 dark:text-slate-100">Can Edit</span>
                    </div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Can view and edit organization</span>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={async () => {
                if (!selectedOrg) return;

                setIsSubmitting(true);
                setError(null);
                setSuccess(null);
                setGeneratedUrl(null);

                try {
                  const baseUrl = window.location.origin;
                  const result = await createInvitation({
                    role: linkRole,
                    organisation: selectedOrg,
                    email: undefined,
                    baseUrl: baseUrl, // Pass current deployment URL
                  });

                  if (result.mode === "link") {
                    const inviteUrl = `${baseUrl}/accept-invitation?token=${encodeURIComponent(result.token)}`;
                    setGeneratedUrl(inviteUrl);
                    setSuccess("Invitation URL generated! Copy and share it with anyone you want to invite.");
                  }
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Failed to generate invitation";
                  setError(message);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              disabled={isSubmitting}
              className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-3 px-6 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Generating..." : "Generate Shareable Link"}
            </button>

            {generatedUrl && (
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Invitation URL (copy and share):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={generatedUrl}
                    readOnly
                    className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                  />
                  <button
                    type="button"
                    onClick={copyInviteUrl}
                    className="bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold rounded-lg py-2 px-4 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Access Requests */}
      {isOwner && accessRequests && accessRequests.length > 0 && (
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <UserPlus className="size-5" />
            Pending Access Requests
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Review and approve or decline access requests from users who want to join your organization.
          </p>
          <div className="flex flex-col gap-3">
            {accessRequests.map((request) => (
              <div
                key={request._id}
                className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {request.requestedEmail}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-1">
                    <Clock className="size-3" />
                    <span>
                      {request.role === "viewer" ? "View Only" : "Can Edit"} •
                      Requested {new Date(request.requestedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleApproveRequest(request._id, request.requestedEmail)}
                    variant="ghost"
                    size="sm"
                    className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleDeclineRequest(request._id, request.requestedEmail)}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Invitations */}
      {isOwner && pendingInvitations.length > 0 && (
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-6 shadow-sm">
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
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {invitation.invitationType === "email"
                      ? invitation.email
                      : "Shareable Link (no specific email)"}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-1">
                    <Clock className="size-3" />
                    <span>
                      {invitation.role === "viewer" ? "View Only" : "Can Edit"} •
                      {invitation.invitationType === "email" ? " Single-use • " : " Reusable • "}
                      Expires {new Date(invitation.expiresAt).toLocaleDateString()}
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
                    onClick={() => handleRevokeInvitation(invitation._id, invitation.invitationType === "email" ? (invitation.email ?? "this invitation") : "this shareable link")}
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

      {/* Confirmation Modal */}
      {confirmDialog && (() => {
        const isDestructive = confirmDialog.action !== "approve";
        const titles = {
          approve: "Approve access request?",
          decline: "Decline access request?",
          remove: "Remove user access?",
          revoke: "Revoke invitation?",
        };
        const bodies = {
          approve: <span>This will grant <strong>{confirmDialog.label}</strong> access to your organization.</span>,
          decline: <span>This will decline the access request from <strong>{confirmDialog.label}</strong>.</span>,
          remove: <span>This will remove <strong>{confirmDialog.label}</strong> from your organization. This cannot be undone.</span>,
          revoke: <span>This will revoke the invitation for <strong>{confirmDialog.label}</strong>. The link will no longer work.</span>,
        };
        const confirmLabels = { approve: "Approve", decline: "Decline", remove: "Remove", revoke: "Revoke" };
        const loadingLabels = { approve: "Approving...", decline: "Declining...", remove: "Removing...", revoke: "Revoking..." };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => !isConfirming && setConfirmDialog(null)}
            />
            <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  isDestructive ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"
                }`}>
                  <AlertTriangle className={`size-5 ${
                    isDestructive ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                    {titles[confirmDialog.action]}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {bodies[confirmDialog.action]}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  disabled={isConfirming}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmAction}
                  disabled={isConfirming}
                  className={`text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isDestructive ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {isConfirming ? loadingLabels[confirmDialog.action] : confirmLabels[confirmDialog.action]}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Active Members */}
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-xl text-slate-900 dark:text-slate-100 mb-4">Active Users</h2>
        {activeMembers.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">No additional users yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {activeMembers.map((member) => (
              <div
                key={member._id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {member.name && member.surname ? `${member.name} ${member.surname}` : member.email}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-medium px-3 py-1 rounded ${
                      member.role === "owner"
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        : member.role === "editor"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {member.role === "owner" ? "Owner" : member.role === "editor" ? "Editor" : "Viewer"}
                  </span>
                  {isOwner && member.role !== "owner" && (
                    <Button
                      onClick={() => handleRemoveMember(member._id, member.name && member.surname ? `${member.name} ${member.surname}` : member.email)}
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
