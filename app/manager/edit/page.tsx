//add ability to dynamically add view only managers and other super users to organization

"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Id } from "../../../convex/_generated/dataModel";

export default function EditOrganizationPage() {
  const user = useQuery(api.users.getCurrentUser);
  const viewer = user?.name ?? user?.email ?? null;

  const employees = useQuery(api.employees.list);
  const addEmployee = useMutation(api.employees.add);
  const removeEmployee = useMutation(api.employees.remove);

  const groups = useQuery(api.groups.list);
  const addGroup = useMutation(api.groups.add);
  const removeGroup = useMutation(api.groups.remove);
  const addMember = useMutation(api.groups.addMember);
  const removeMember = useMutation(api.groups.removeMember);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Id<"groups"> | null>(null);

  const isLoading = employees === undefined;
  const isGroupsLoading = groups === undefined;

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !email.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await addEmployee({
        firstName: firstName.trim(),
        email: email.trim(),
      });
      setFirstName("");
      setEmail("");
    } catch (error) {
      console.error("Failed to add employee:", error);
      alert("Failed to add employee. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveEmployee = async (employeeId: string) => {
    try {
      await removeEmployee({ employeeId: employeeId as any });
    } catch (error) {
      console.error("Failed to remove employee:", error);
      alert("Failed to remove employee. Please try again.");
    }
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!groupName.trim() || isAddingGroup) {
      return;
    }

    setIsAddingGroup(true);
    try {
      await addGroup({ name: groupName.trim() });
      setGroupName("");
    } catch (error) {
      console.error("Failed to add group:", error);
      alert("Failed to add group. Please try again.");
    } finally {
      setIsAddingGroup(false);
    }
  };

  const handleRemoveGroup = async (groupId: Id<"groups">) => {
    if (!confirm("Are you sure you want to delete this group? All members will be removed.")) {
      return;
    }

    try {
      await removeGroup({ groupId });
    } catch (error) {
      console.error("Failed to remove group:", error);
      alert("Failed to remove group. Please try again.");
    }
  };

  const handleAddMemberToGroup = async (groupId: Id<"groups">, employeeId: Id<"employees">) => {
    try {
      await addMember({ groupId, employeeId });
    } catch (error: any) {
      console.error("Failed to add member:", error);
      alert(error?.message || "Failed to add member. Please try again.");
    }
  };

  const handleRemoveMemberFromGroup = async (membershipId: Id<"groupMembers">) => {
    try {
      await removeMember({ membershipId });
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert("Failed to remove member. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h2 className="font-bold text-2xl text-slate-800 dark:text-slate-200">
          Organization Management - {viewer ?? "Anonymous"}
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Manage your organization's employees, groups, and settings.
        </p>
      </div>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN - Employee Management */}
        <div className="flex flex-col gap-6">
          <div className="text-center pb-2 border-b-2 border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-200">
              Manage Employees
            </h3>
          </div>
      {/* Add Employee Form */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-4">
          Add New Employee
        </h3>
        <form onSubmit={handleAddEmployee} className="flex flex-col gap-3">
          <Input
            id="firstName"
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            id="email"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Adding..." : "Add Employee"}
          </Button>
        </form>
      </div>

      {/* Employee List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-4">
          Employees ({isLoading ? "..." : employees.length})
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
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
              <p className="ml-2 text-slate-600 dark:text-slate-400">Loading employees...</p>
            </div>
          </div>
        ) : employees.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">
            No employees added yet. Add your first employee above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {employees.map((employee) => (
              <div
                key={employee._id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {employee.firstName}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {employee.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveEmployee(employee._id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <span className="text-xl">×</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
        </div>
        {/* END LEFT COLUMN */}

        {/* MIDDLE COLUMN - Groups Management */}
        <div className="flex flex-col gap-6">
          <div className="text-center pb-2 border-b-2 border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-200">
              Manage Groups
            </h3>
          </div>
      {/* Groups Management */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-4">
          Add New Group
        </h3>
        <form onSubmit={handleAddGroup} className="flex flex-col gap-3">
          <Input
            type="text"
            placeholder="Group Name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            required
          />
          <div className="h-9"></div>
          <Button type="submit" disabled={isAddingGroup} className="w-full">
            {isAddingGroup ? "Adding..." : "Add Group"}
          </Button>
        </form>
      </div>

      {/* Groups List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-4">
          Groups ({isGroupsLoading ? "..." : groups.length})
        </h3>
        {isGroupsLoading ? (
          <div className="flex items-center justify-center py-8">
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
              <p className="ml-2 text-slate-600 dark:text-slate-400">Loading groups...</p>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">
            No groups created yet. Add your first group above.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <GroupCard
                key={group._id}
                group={group}
                employees={employees || []}
                onRemoveGroup={handleRemoveGroup}
                onAddMember={handleAddMemberToGroup}
                onRemoveMember={handleRemoveMemberFromGroup}
              />
            ))}
          </div>
        )}
      </div>
        </div>
        {/* END MIDDLE COLUMN */}

        {/* RIGHT COLUMN - Features Coming Soon */}
        <div className="flex flex-col gap-6">
          <div className="text-center pb-2 border-b-2 border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-200">
              Features Coming Soon
            </h3>
          </div>

          <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8">
            <div className="flex flex-col gap-4">
              <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <span className="text-2xl">👥</span>
                  Super Users
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Assign elevated permissions to specific users within your organization.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <span className="text-2xl">👁️</span>
                  View-Only Managers
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Grant read-only access to managers who need to view but not edit data.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <span className="text-2xl">🏢</span>
                  Multiple Organizations
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Manage multiple organizations from a single account with easy switching.
                </p>
              </div>

              <div className="mt-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  These features are in development and will be available soon!
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* END RIGHT COLUMN */}

      </div>
      {/* END THREE COLUMN LAYOUT */}
    </div>
  );
}

function GroupCard({
  group,
  employees,
  onRemoveGroup,
  onAddMember,
  onRemoveMember,
}: {
  group: any;
  employees: any[];
  onRemoveGroup: (groupId: Id<"groups">) => void;
  onAddMember: (groupId: Id<"groups">, employeeId: Id<"employees">) => void;
  onRemoveMember: (membershipId: Id<"groupMembers">) => void;
}) {
  const members = useQuery(api.groups.getMembers, { groupId: group._id });
  const [showAddMember, setShowAddMember] = useState(false);

  const availableEmployees = employees.filter(
    (emp) => !members?.some((m: any) => m._id === emp._id)
  );

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-slate-800 dark:text-slate-200">
          {group.name}
        </h4>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onRemoveGroup(group._id)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
        >
          <span className="text-xl">×</span>
        </Button>
      </div>

      {/* Members */}
      <div className="mb-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Members ({members?.length || 0})
        </p>
        {members === undefined ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading members...</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No members yet</p>
        ) : (
          <div className="flex flex-col gap-1">
            {members.map((member: any) => (
              <div
                key={member.membershipId}
                className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {member.firstName}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {member.email}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemoveMember(member.membershipId)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <span className="text-lg">×</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Member */}
      {availableEmployees.length > 0 && (
        <div>
          {showAddMember ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Add Employee:
              </p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {availableEmployees.map((emp) => (
                  <button
                    key={emp._id}
                    onClick={() => {
                      onAddMember(group._id, emp._id);
                      setShowAddMember(false);
                    }}
                    className="text-left p-2 text-sm bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {emp.firstName}
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 ml-2">
                      ({emp.email})
                    </span>
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddMember(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => setShowAddMember(true)}
              className="w-full bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white"
            >
              + Add Member
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
