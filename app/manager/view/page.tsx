"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useMemo, useEffect } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { useAuthActions } from "@convex-dev/auth/react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useRouter } from "next/navigation";

export default function ViewOrganizationPage() {
  const user = useQuery(api.users.getCurrentUser);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  // Capture current time on mount for calculations (avoids impure Date.now() in render)
  const [mountTime] = useState(() => Date.now());

  // Get selected organization from localStorage
  useEffect(() => {
    const updateSelectedOrg = () => {
      if (typeof window !== "undefined") {
        const org = localStorage.getItem("selectedOrganization");
        setSelectedOrg(org);
      }
    };

    // Initial load
    updateSelectedOrg();

    // Listen for organization changes
    window.addEventListener("organizationChanged", updateSelectedOrg);
    window.addEventListener("storage", updateSelectedOrg);

    return () => {
      window.removeEventListener("organizationChanged", updateSelectedOrg);
      window.removeEventListener("storage", updateSelectedOrg);
    };
  }, []);

  // Support both old users (with surname field) and new users (full name in name field)
  const viewer = user?.surname
    ? `${user.name} ${user.surname}`.trim()
    : user?.name ?? user?.email ?? null;

  const [timeRange, setTimeRange] = useState<"1week" | "1month" | "1year" | "overall">("1week");
  const [groupTimeRange, setGroupTimeRange] = useState<"1week" | "1month" | "1year" | "overall">("1week");
  const [selectedGroupId, setSelectedGroupId] = useState<Id<"groups"> | null>(null);
  const [historicalMoodFilter, setHistoricalMoodFilter] = useState<"all" | "green" | "amber" | "red">("all");

  // Check if user has access to the selected organization
  const userRole = useQuery(
    api.organizationMemberships.getUserRoleInOrg,
    selectedOrg ? { organisation: selectedOrg } : "skip"
  );

  // Handle access denial - if user doesn't have access to the org, sign them out
  useEffect(() => {
    // Only check if we have a selected org and both queries have completed.
    // Also confirm via userOrgs that this org is genuinely not in the user's
    // membership list — this prevents a false-positive during the brief window
    // after sign-up where getUserRoleInOrg may return null before Convex auth
    // has fully propagated the new session to the backend.
    if (
      selectedOrg &&
      userRole !== undefined &&
      userRole === null &&
      userOrgs !== undefined &&
      !userOrgs.some((m) => m.organisation === selectedOrg)
    ) {
      // Clear the invalid organization from localStorage
      localStorage.removeItem("selectedOrganization");

      // Sign out and redirect to homepage
      void signOut().then(() => {
        router.push("/");
      });
    }
  }, [selectedOrg, userRole, userOrgs, signOut, router]);

  const employees = useQuery(
    api.employees.list,
    selectedOrg && userRole ? { organisation: selectedOrg } : "skip"
  );

  // Calculate days based on time range (for organization)
  // For "overall", calculate days since organization creation
  const days = useMemo(() => {
    if (timeRange === "overall") {
      // Find the earliest employee creation date as proxy for org creation
      const earliestEmployee = employees && employees.length > 0 ? employees.reduce((earliest, emp) =>
        !earliest || emp.createdAt < earliest.createdAt ? emp : earliest
      , employees[0]) : null;

      if (earliestEmployee) {
        return Math.ceil((mountTime - earliestEmployee.createdAt) / (1000 * 60 * 60 * 24));
      }
      return 365; // fallback
    }
    return timeRange === "1week" ? 7 : timeRange === "1month" ? 30 : 365;
  }, [timeRange, employees, mountTime]);

  // Calculate days based on group time range
  const groupDays = useMemo(() => {
    if (groupTimeRange === "overall") {
      const earliestEmployee = employees && employees.length > 0 ? employees.reduce((earliest, emp) =>
        !earliest || emp.createdAt < earliest.createdAt ? emp : earliest
      , employees[0]) : null;

      if (earliestEmployee) {
        return Math.ceil((mountTime - earliestEmployee.createdAt) / (1000 * 60 * 60 * 24));
      }
      return 365; // fallback
    }
    return groupTimeRange === "1week" ? 7 : groupTimeRange === "1month" ? 30 : 365;
  }, [groupTimeRange, employees, mountTime]);

  const todayCheckins = useQuery(
    api.moodCheckins.getTodayCheckins,
    selectedOrg && userRole ? { organisation: selectedOrg } : "skip"
  );
  const groups = useQuery(
    api.groups.list,
    selectedOrg && userRole ? { organisation: selectedOrg } : "skip"
  );
  const historicalCheckins = useQuery(
    api.moodCheckins.getHistoricalCheckins,
    selectedOrg && userRole ? { days: 30, organisation: selectedOrg } : "skip"
  );

  // Check if user has any organization memberships (to determine if truly new)
  // MUST be called before any conditional returns (React Hooks rules)
  const userOrgs = useQuery(api.organizationMemberships.getUserOrganizations);

  // Auto-select first group when groups load
  useEffect(() => {
    if (groups && groups.length > 0 && selectedGroupId === null) {
      // Use queueMicrotask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setSelectedGroupId(groups[0]._id);
      });
    }
  }, [groups, selectedGroupId]);

  // Sort check-ins by most recent first and filter only those with notes
  const sortedCheckins = useMemo(() => {
    if (!todayCheckins) return [];
    return [...todayCheckins]
      .filter((checkin) => checkin.note && checkin.note.trim().length > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [todayCheckins]);

  // Filter historical check-ins based on mood filter
  const filteredHistoricalCheckins = useMemo(() => {
    if (!historicalCheckins) return [];
    if (historicalMoodFilter === "all") return historicalCheckins;
    return historicalCheckins.filter((checkin) => checkin.mood === historicalMoodFilter);
  }, [historicalCheckins, historicalMoodFilter]);

  // Check if this is a new user with no employees - only when data is loaded
  const isNewOrganization = employees !== undefined && employees.length === 0;
  const isFirstTimeUser = userOrgs !== undefined && userOrgs.length === 0;

  // Show welcome page for first-time users (users with no organization memberships)
  // Check this BEFORE showing loading screen, since first-time users won't have selectedOrg
  if (userOrgs !== undefined && isFirstTimeUser) {
    return (
      <div className="flex flex-col gap-10 px-4 md:px-8 py-8 mx-auto w-full max-w-4xl">
        <div className="text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="font-bold text-4xl text-slate-900 dark:text-slate-100 mb-4">
            Welcome, {viewer ?? "there"}!
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">
            You&apos;ve successfully created your account. Let&apos;s get you started!
          </p>
        </div>
        
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-blue-200/50 dark:border-blue-700/50 p-8 shadow-sm">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
              What&apos;s Next?
            </h2>
            <div className="flex flex-col gap-6 items-start text-left">
              <div className="flex items-start gap-4 w-full">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 text-white font-bold text-lg flex-shrink-0">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-2">
                    Join or Create an Organization
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    You can join an organization by accepting an invitation link, or create your own organization from the sidebar.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 w-full">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 text-white font-bold text-lg flex-shrink-0">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-2">
                    Add Employees
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    Once you have an organization, add employees who will receive daily wellbeing check-ins.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 w-full">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 text-white font-bold text-lg flex-shrink-0">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-2">
                    Track Wellbeing
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    Monitor your team&apos;s wellbeing trends and respond to those who need support.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-blue-200 dark:border-blue-700">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Use the sidebar to navigate and get started!
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state if we're waiting for essential data (for users with organizations)
  if (user === undefined || employees === undefined) {
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
    <div className="flex flex-col gap-10 px-4 md:px-8 py-8 mx-auto w-full max-w-full md:max-w-[90%] lg:max-w-[80%] min-w-[777px]">
      <div className="text-center">
        <h1 className="font-bold text-3xl text-slate-900 dark:text-slate-100 mb-3">
          Welcome {viewer ?? "Anonymous"}!
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-lg">
          Here is your organization&apos;s wellbeing dashboard.
        </p>
      </div>

      {/* Color Key Legend */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
        <div className="flex gap-6 flex-wrap justify-center items-center">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Feeling Great
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-500 rounded"></div>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Feeling Okay
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Need Support
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-slate-300 dark:bg-slate-600 rounded"></div>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              No Response
            </span>
          </div>
        </div>
      </div>

      {/* Empty State for New Organizations */}
      {isNewOrganization && (
        <div className="flex flex-col items-center justify-center py-16 px-8 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border-2 border-dashed border-slate-300/50 dark:border-slate-600/50 shadow-sm">
          <div className="text-center max-w-2xl">
            <div className="text-6xl mb-6">🚀</div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
              Let&apos;s Get Started!
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
              Your organization dashboard is ready, but you haven&apos;t added any employees yet.
              Click the <span className="font-semibold text-slate-800 dark:text-slate-200">&quot;Edit Organization&quot;</span> button
              in the sidebar to add your first employees.
            </p>
            <div className="flex flex-col gap-4 items-start mx-auto pl-43">
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-bold">1</div>
                <span>Add employees to your organization</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-bold">2</div>
                <span>Create groups (optional)</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-bold">3</div>
                <span>Employees will receive daily check-in emails</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-bold">4</div>
                <span>Track wellbeing trends on this dashboard</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      {!isNewOrganization && (
      <div className="grid grid-cols-1 2xl:grid-cols-4 gap-12 2xl:gap-32">
        {/* LEFT COLUMN - Graphs (3/4 width) */}
        <div className="2xl:col-span-3 flex flex-col gap-8">
          {/* Time Range Toggle */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
              Time Range Filter (Organization)
            </h3>
            <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTimeRange("1week")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeRange === "1week"
                  ? "bg-slate-700 text-white dark:bg-slate-600"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              1 Week
            </button>
            <button
              onClick={() => setTimeRange("1month")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeRange === "1month"
                  ? "bg-slate-700 text-white dark:bg-slate-600"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              1 Month
            </button>
            <button
              onClick={() => setTimeRange("1year")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeRange === "1year"
                  ? "bg-slate-700 text-white dark:bg-slate-600"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              1 Year
            </button>
            <button
              onClick={() => setTimeRange("overall")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeRange === "overall"
                  ? "bg-slate-700 text-white dark:bg-slate-600"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              Overall
            </button>
            </div>
          </div>

          {/* Overall Organization Mood Graph */}
          <div className="flex flex-col gap-6">
            <h2 className="font-bold text-2xl text-slate-900 dark:text-slate-100 text-center border-b-2 border-slate-300 dark:border-slate-600 pb-3">
              Organization Mood {(timeRange === "overall" || timeRange === "1year") && "(Monthly Average)"}
            </h2>
            <OrganizationMoodGraph days={days} timeRange={timeRange} organisation={selectedOrg} />
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-700 my-4"></div>

          {/* Group Filter and Graph */}
          {groups && groups.length > 0 && (
            <div className="flex flex-col gap-6">
              {/* Group Filter Tabs */}
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
                  Group Filter
                </h3>
                <div className="relative">
                  <div
                    className="flex gap-2 overflow-x-auto pb-2"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgb(203 213 225) transparent'
                    }}
                  >
                    {groups.map((group) => (
                      <button
                        key={group._id}
                        onClick={() => setSelectedGroupId(group._id)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                          selectedGroupId === group._id
                            ? "bg-slate-700 text-white dark:bg-slate-600"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        }`}
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Group Time Range Filter */}
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
                  Time Range Filter (Group)
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setGroupTimeRange("1week")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      groupTimeRange === "1week"
                        ? "bg-slate-700 text-white dark:bg-slate-600"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    1 Week
                  </button>
                  <button
                    onClick={() => setGroupTimeRange("1month")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      groupTimeRange === "1month"
                        ? "bg-slate-700 text-white dark:bg-slate-600"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    1 Month
                  </button>
                  <button
                    onClick={() => setGroupTimeRange("1year")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      groupTimeRange === "1year"
                        ? "bg-slate-700 text-white dark:bg-slate-600"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    1 Year
                  </button>
                  <button
                    onClick={() => setGroupTimeRange("overall")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      groupTimeRange === "overall"
                        ? "bg-slate-700 text-white dark:bg-slate-600"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    Overall
                  </button>
                </div>
              </div>

              {/* Selected Group Mood Graph */}
              {selectedGroupId && (
                <div className="flex flex-col gap-6">
                  <h2 className="font-bold text-2xl text-slate-900 dark:text-slate-100 text-center border-b-2 border-slate-300 dark:border-slate-600 pb-3">
                    {groups.find(g => g._id === selectedGroupId)?.name} Mood {(groupTimeRange === "overall" || groupTimeRange === "1year") && "(Monthly Average)"}
                  </h2>
                  <GroupMoodGraph key={`${selectedGroupId}-${groupDays}`} groupId={selectedGroupId} groupName={groups.find(g => g._id === selectedGroupId)?.name || ""} days={groupDays} timeRange={groupTimeRange} organisation={selectedOrg} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Recent Comments (1/3 width) */}
        <div className="flex flex-col gap-3 2xl:gap-6">
          {/* Spacer to align with Overall Organization Mood heading */}
          <div className="hidden 2xl:block h-[88px]"></div>

          <h2 className="font-bold text-2xl text-slate-900 dark:text-slate-100 border-b-2 border-slate-300 dark:border-slate-600 pb-3">
            Recent Check-ins
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 -mt-3">
            Last 24 hours
          </p>
          <div className="grid grid-cols-3 2xl:grid-cols-1 gap-4 max-h-[650px] 2xl:h-[600px] overflow-y-auto pr-2 items-start" style={{ gridAutoRows: 'min-content', scrollbarWidth: 'thin', scrollbarColor: 'rgb(203 213 225) transparent' }}>
            {sortedCheckins.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8 col-span-3 2xl:col-span-1">
                No check-ins in the last 24 hours.
              </p>
            ) : (
              sortedCheckins.map((checkin) => (
                <div
                  key={checkin._id}
                  className={`p-4 rounded-lg border ${
                    checkin.mood === "green"
                      ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                      : checkin.mood === "amber"
                      ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
                      : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                      {checkin.isAnonymous ? "Anonymous" : checkin.employeeName}
                    </span>
                    <span className="text-xl">
                      {checkin.mood === "green" ? "😊" : checkin.mood === "amber" ? "😐" : "😔"}
                    </span>
                  </div>
                  {checkin.note && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                      &quot;{checkin.note}&quot;
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {new Date(checkin.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {checkin.isAnonymous && " • Anonymous"}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Historical Check-ins Section (Organization-wide) */}
          <>
            {/* Spacer between sections */}
            <div className="h-[48px]"></div>

            <h2 className="font-bold text-2xl text-slate-900 dark:text-slate-100 border-b-2 border-slate-300 dark:border-slate-600 pb-3">
              Check-in History
            </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 -mt-3">
                Past 30 days
              </p>

              {/* Mood Filter Buttons */}
              <div className="flex gap-2 flex-wrap mt-3">
                <button
                  onClick={() => setHistoricalMoodFilter("all")}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    historicalMoodFilter === "all"
                      ? "bg-slate-700 text-white dark:bg-slate-600"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setHistoricalMoodFilter("green")}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    historicalMoodFilter === "green"
                      ? "bg-green-600 text-white"
                      : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
                  }`}
                >
                  😊 Great
                </button>
                <button
                  onClick={() => setHistoricalMoodFilter("amber")}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    historicalMoodFilter === "amber"
                      ? "bg-amber-600 text-white"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:hover:bg-amber-800"
                  }`}
                >
                  😐 Okay
                </button>
                <button
                  onClick={() => setHistoricalMoodFilter("red")}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    historicalMoodFilter === "red"
                      ? "bg-red-600 text-white"
                      : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
                  }`}
                >
                  😔 Support
                </button>
              </div>

              <div
                className="grid grid-cols-3 2xl:grid-cols-1 gap-4 max-h-[376px] 2xl:max-h-[600px] overflow-y-auto pr-2 mt-4 items-start"
                style={{
                  gridAutoRows: 'min-content',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgb(203 213 225) transparent'
                }}
              >
                {filteredHistoricalCheckins.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-center py-8 col-span-3 2xl:col-span-1">
                    No historical check-ins with notes.
                  </p>
                ) : (
                  filteredHistoricalCheckins.map((checkin) => (
                    <div
                      key={checkin._id}
                      className={`p-4 rounded-lg border ${
                        checkin.mood === "green"
                          ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                          : checkin.mood === "amber"
                          ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
                          : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                          {checkin.isAnonymous ? "Anonymous" : checkin.employeeName}
                        </span>
                        <span className="text-xl">
                          {checkin.mood === "green" ? "😊" : checkin.mood === "amber" ? "😐" : "😔"}
                        </span>
                      </div>
                      {checkin.note && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                          &quot;{checkin.note}&quot;
                        </p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {new Date(checkin.timestamp).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {checkin.isAnonymous && " • Anonymous"}
                      </p>
                    </div>
                  ))
                )}
              </div>
          </>
        </div>
      </div>
      )}
    </div>
  );
}

// Reusable Mood Graph Component
function MoodGraph({ trends, isMonthly = false }: { trends: Array<{ date: string; green: number; amber: number; red: number; total: number; employeeCount: number; greenPercent: number; amberPercent: number; redPercent: number }>; isMonthly?: boolean }) {
  // Y-axis should go up to the maximum number of employees across all days
  // Also consider actual response totals to ensure historical data isn't cut off
  const maxEmployeeCount = Math.max(...trends.map(d => d.employeeCount || 0), 1);
  const maxResponseTotal = Math.max(...trends.map(d => (d.green || 0) + (d.amber || 0) + (d.red || 0)), 1);
  const maxY = Math.max(maxEmployeeCount, maxResponseTotal); // Avoid division by zero
  // Adjust y-axis steps based on group size to prevent duplicate labels
  const yAxisSteps = Math.min(maxY, 5);
  const stepValue = maxY / yAxisSteps;

  // Calculate dynamic graph width based on number of bars
  // Adjust bar width based on data density to keep graphs at similar overall width
  const barWidth = trends.length <= 7 ? 50 :      // 1 week: 50px per bar = 350px
                   trends.length <= 14 ? 40 :     // 2 weeks: 40px per bar = 560px
                   trends.length <= 30 ? 30 :     // 1 month: 30px per bar = 900px
                   50;                            // 1 year (12 months): 50px per bar = 600px
  const graphWidth = trends.length * barWidth;
  // Total container width = y-axis labels (64px) + graph width + padding (48px)
  const containerWidth = graphWidth + 112;

  return (
    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-6 shadow-sm">
      <div className="flex justify-center">
        <div className="overflow-x-auto max-w-full" style={{ paddingTop: '9rem', marginTop: '-9rem' }}>
        {/* Graph Container */}
        <div className="relative h-80 flex" style={{ minWidth: `${containerWidth}px` }}>
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between pr-4 text-xs text-slate-600 dark:text-slate-400 w-12">
          {Array.from({ length: yAxisSteps + 1 }).map((_, i) => {
            const value = maxY - (i * stepValue);
            return (
              <div key={i} className="text-right">
                {Math.round(value)}
              </div>
            );
          })}
        </div>

        {/* Graph area */}
        <div className="relative border-l-2 border-b-2 border-slate-300 dark:border-slate-600" style={{ width: `${graphWidth}px` }}>
          {/* Horizontal grid lines */}
          <div className="absolute inset-0">
            {Array.from({ length: yAxisSteps }).map((_, i) => (
              <div
                key={i}
                className="absolute w-full border-t border-slate-200 dark:border-slate-700"
                style={{ top: `${(i / yAxisSteps) * 100}%` }}
              />
            ))}
          </div>

          {/* Data visualization */}
          <div className="absolute inset-0 flex items-end">
            {trends.map((day, index) => {
              const employeeCountOnDay = day.employeeCount || 0;
              const noResponse = employeeCountOnDay - day.total;
              const greenHeight = maxY > 0 ? (day.green / maxY) * 100 : 0;
              const amberHeight = maxY > 0 ? (day.amber / maxY) * 100 : 0;
              const redHeight = maxY > 0 ? (day.red / maxY) * 100 : 0;
              const noResponseHeight = maxY > 0 ? (noResponse / maxY) * 100 : 0;

              return (
                <div
                  key={index}
                  className={`flex-1 flex flex-col items-center justify-end group relative h-full px-1`}
                >
                  {/* Tooltip on hover - only show if there are employees on this day */}
                  {employeeCountOnDay > 0 && (
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-900 dark:bg-slate-700 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    <div className="font-semibold mb-1">
                      {new Date(day.date).toLocaleDateString("en-US", isMonthly ? {
                        month: "long",
                        year: "numeric",
                      } : {
                        month: "short",
                        day: "numeric",
                      })}
                      {isMonthly && " (Avg)"}
                    </div>
                    <div className="text-green-300">😊 {isMonthly ? day.green.toFixed(1) : Math.round(day.green)} ({day.greenPercent}%)</div>
                    <div className="text-amber-300">😐 {isMonthly ? day.amber.toFixed(1) : Math.round(day.amber)} ({day.amberPercent}%)</div>
                    <div className="text-red-300">😔 {isMonthly ? day.red.toFixed(1) : Math.round(day.red)} ({day.redPercent}%)</div>
                    <div className="text-slate-400">No response: {isMonthly ? noResponse.toFixed(1) : Math.round(noResponse)}</div>
                    <div className="border-t border-slate-600 mt-1 pt-1">Total: {isMonthly ? day.total.toFixed(1) : Math.round(day.total)}/{isMonthly ? day.employeeCount.toFixed(1) : Math.round(employeeCountOnDay)}</div>
                  </div>
                  )}

                  {/* Stacked bars */}
                  <div className="w-full flex flex-col-reverse items-center h-full">
                    {/* Green - at top */}
                    {day.green > 0 && (
                      <div
                        className="w-full bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center text-xs font-semibold text-white"
                        style={{ height: `${greenHeight}%` }}
                      >
                        {greenHeight > 3 && (isMonthly ? day.green.toFixed(1) : Math.round(day.green))}
                      </div>
                    )}
                    {/* Amber */}
                    {day.amber > 0 && (
                      <div
                        className="w-full bg-amber-500 hover:bg-amber-600 transition-colors flex items-center justify-center text-xs font-semibold text-white"
                        style={{ height: `${amberHeight}%` }}
                      >
                        {amberHeight > 3 && (isMonthly ? day.amber.toFixed(1) : Math.round(day.amber))}
                      </div>
                    )}
                    {/* Red */}
                    {day.red > 0 && (
                      <div
                        className="w-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center text-xs font-semibold text-white"
                        style={{ height: `${redHeight}%` }}
                      >
                        {redHeight > 3 && (isMonthly ? day.red.toFixed(1) : Math.round(day.red))}
                      </div>
                    )}
                    {/* No Response (Grey) - at bottom */}
                    {noResponse > 0 && (
                      <div
                        className="w-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200"
                        style={{ height: `${noResponseHeight}%` }}
                      >
                        {noResponseHeight > 3 && (isMonthly ? noResponse.toFixed(1) : Math.round(noResponse))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex mt-2" style={{ minWidth: `${containerWidth}px` }}>
        <div className="w-12 pr-4"></div>
        <div className="flex border-l-2 border-transparent" style={{ width: `${graphWidth}px` }}>
          {trends.map((day, index) => {
            // For monthly view, show all labels; for daily, show selectively
            const showLabel = isMonthly ? true :
                             trends.length <= 7 ? true :
                             trends.length <= 14 ? index % 2 === 0 :
                             trends.length <= 30 ? index % 3 === 0 :
                             index % 7 === 0 || index === trends.length - 1;

            const date = new Date(day.date);
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            let monthLabel = "";
            let dayOrYearLabel = "";

            if (showLabel) {
              monthLabel = monthNames[date.getMonth()];
              if (isMonthly) {
                // Show year underneath for monthly view
                dayOrYearLabel = `'${date.getFullYear().toString().slice(-2)}`;
              } else {
                // Show day underneath for daily view
                dayOrYearLabel = date.getDate().toString();
              }
            }

            return (
              <div
                key={index}
                className="flex-1 text-center text-xs text-slate-600 dark:text-slate-400 px-1 flex flex-col leading-tight"
              >
                {showLabel && (
                  <>
                    <div>{monthLabel}</div>
                    <div>{dayOrYearLabel}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

// Organization Mood Graph Component
function OrganizationMoodGraph({ days, timeRange, organisation }: { days: number; timeRange: "1week" | "1month" | "1year" | "overall"; organisation: string | null }) {
  const trends = useQuery(api.moodCheckins.getTrends, organisation ? { days, organisation } : "skip");

  // Aggregate into monthly averages when viewing "overall" or "1year"
  const displayTrends = useMemo(() => {
    if (!trends) return trends;

    if (timeRange !== "overall" && timeRange !== "1year") return trends;

    const monthMap = new Map<string, { green: number[], amber: number[], red: number[], employeeCounts: number[], totalDays: number, date: string }>();

    // Process all days and aggregate by month
    trends.forEach(day => {
      const date = new Date(day.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          green: [],
          amber: [],
          red: [],
          employeeCounts: [],
          totalDays: 0,
          date: monthKey + '-01'
        });
      }

      const month = monthMap.get(monthKey)!;
      const hasEmployees = (day.employeeCount || 0) > 0;

      // Only include days with employees in the averaging
      if (hasEmployees) {
        month.green.push(day.green);
        month.amber.push(day.amber);
        month.red.push(day.red);
        month.employeeCounts.push(day.employeeCount || 0);
        month.totalDays++;
      }
    });

    // Calculate averages and convert to array
    return Array.from(monthMap.values())
      .map(month => {
        // If no days with employees in this month, return empty month
        if (month.totalDays === 0) {
          return {
            date: month.date,
            green: 0,
            amber: 0,
            red: 0,
            total: 0,
            employeeCount: 0,
            greenPercent: 0,
            amberPercent: 0,
            redPercent: 0,
          };
        }

        // Sum all values and divide by total days with employees
        const totalGreen = month.green.reduce((a, b) => a + b, 0);
        const totalAmber = month.amber.reduce((a, b) => a + b, 0);
        const totalRed = month.red.reduce((a, b) => a + b, 0);

        const green = totalGreen / month.totalDays;
        const amber = totalAmber / month.totalDays;
        const red = totalRed / month.totalDays;
        const total = green + amber + red;
        // Use maximum employee count for the month (not average) for proper graph scaling
        const employeeCount = Math.max(...month.employeeCounts, 0);

        return {
          date: month.date,
          green,
          amber,
          red,
          total,
          employeeCount,
          greenPercent: total > 0 ? Math.round((green / total) * 100) : 0,
          amberPercent: total > 0 ? Math.round((amber / total) * 100) : 0,
          redPercent: total > 0 ? Math.round((red / total) * 100) : 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12); // Only show last 12 months
  }, [trends, timeRange]);

  if (trends === undefined) {
    return (
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-6 mx-auto shadow-sm" style={{ width: "600px", height: "480px" }}>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner message="Loading..." />
        </div>
      </div>
    );
  }

  return (
    <MoodGraph trends={displayTrends || []} isMonthly={timeRange === "overall" || timeRange === "1year"} />
  );
}

// Group-Specific Mood Graph Component
function GroupMoodGraph({ groupId, groupName, days, timeRange, organisation }: { groupId: Id<"groups">; groupName: string; days: number; timeRange: "1week" | "1month" | "1year" | "overall"; organisation: string | null }) {
  const trends = useQuery(api.moodCheckins.getGroupTrends, organisation ? { groupId, days, organisation } : "skip");
  const members = useQuery(api.groups.getMembers, { groupId });

  // Aggregate into monthly averages when viewing "overall" or "1year"
  const displayTrends = useMemo(() => {
    if (!trends) return trends;

    if (timeRange !== "overall" && timeRange !== "1year") return trends;

    const monthMap = new Map<string, { green: number[], amber: number[], red: number[], employeeCounts: number[], totalDays: number, date: string }>();

    // Process all days and aggregate by month
    trends.forEach(day => {
      const date = new Date(day.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          green: [],
          amber: [],
          red: [],
          employeeCounts: [],
          totalDays: 0,
          date: monthKey + '-01'
        });
      }

      const month = monthMap.get(monthKey)!;
      const hasMembers = (day.employeeCount || 0) > 0;

      // Only include days with group members in the averaging
      if (hasMembers) {
        month.green.push(day.green);
        month.amber.push(day.amber);
        month.red.push(day.red);
        month.employeeCounts.push(day.employeeCount || 0);
        month.totalDays++;
      }
    });

    // Calculate averages and convert to array
    return Array.from(monthMap.values())
      .map(month => {
        // If no days with members in this month, return empty month
        if (month.totalDays === 0) {
          return {
            date: month.date,
            green: 0,
            amber: 0,
            red: 0,
            total: 0,
            employeeCount: 0,
            greenPercent: 0,
            amberPercent: 0,
            redPercent: 0,
          };
        }

        // Sum all values and divide by total days with members
        const totalGreen = month.green.reduce((a, b) => a + b, 0);
        const totalAmber = month.amber.reduce((a, b) => a + b, 0);
        const totalRed = month.red.reduce((a, b) => a + b, 0);

        const green = totalGreen / month.totalDays;
        const amber = totalAmber / month.totalDays;
        const red = totalRed / month.totalDays;
        const total = green + amber + red;
        // Use maximum employee count for the month (not average) for proper graph scaling
        const employeeCount = Math.max(...month.employeeCounts, 0);

        return {
          date: month.date,
          green,
          amber,
          red,
          total,
          employeeCount,
          greenPercent: total > 0 ? Math.round((green / total) * 100) : 0,
          amberPercent: total > 0 ? Math.round((amber / total) * 100) : 0,
          redPercent: total > 0 ? Math.round((red / total) * 100) : 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12); // Only show last 12 months
  }, [trends, timeRange]);

  if (trends === undefined || members === undefined) {
    return (
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-6 mx-auto shadow-sm" style={{ width: "600px", height: "480px" }}>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner message="Loading..." />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h3 className="font-bold text-xl text-slate-900 dark:text-slate-100 mb-6 text-center">{groupName}</h3>
      <MoodGraph trends={displayTrends || []} isMonthly={timeRange === "overall" || timeRange === "1year"} />
    </div>
  );
}
