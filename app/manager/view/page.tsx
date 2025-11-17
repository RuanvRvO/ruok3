"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useMemo, useEffect } from "react";
import { Id } from "../../../convex/_generated/dataModel";

export default function ViewOrganizationPage() {
  const { viewer } =
    useQuery(api.myFunctions.listNumbers, {
      count: 10,
    }) ?? {};

  const [timeRange, setTimeRange] = useState<"1week" | "1month" | "1year" | "overall">("1week");
  const [selectedGroupId, setSelectedGroupId] = useState<Id<"groups"> | null>(null);

  const employees = useQuery(api.employees.list);

  // Calculate days based on time range
  // For "overall", calculate days since organization creation
  let days: number;
  if (timeRange === "overall") {
    // Find the earliest employee creation date as proxy for org creation
    const earliestEmployee = employees && employees.length > 0 ? employees.reduce((earliest, emp) =>
      !earliest || emp.createdAt < earliest.createdAt ? emp : earliest
    , employees[0]) : null;

    if (earliestEmployee) {
      const daysSinceCreation = Math.ceil((Date.now() - earliestEmployee.createdAt) / (1000 * 60 * 60 * 24));
      days = daysSinceCreation;
    } else {
      days = 365; // fallback
    }
  } else {
    days = timeRange === "1week" ? 7 : timeRange === "1month" ? 30 : 365;
  }

  const trends = useQuery(api.moodCheckins.getTrends, { days });
  const todayCheckins = useQuery(api.moodCheckins.getTodayCheckins);
  const groups = useQuery(api.groups.list);

  // Auto-select first group when groups load
  useEffect(() => {
    if (groups && groups.length > 0 && selectedGroupId === null) {
      setSelectedGroupId(groups[0]._id);
    }
  }, [groups, selectedGroupId]);

  const isLoading = trends === undefined || todayCheckins === undefined || groups === undefined || employees === undefined;

  // Sort check-ins by most recent first and filter only those with notes
  const sortedCheckins = useMemo(() => {
    if (!todayCheckins) return [];
    return [...todayCheckins]
      .filter((checkin) => checkin.note && checkin.note.trim().length > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [todayCheckins]);

  // Aggregate into monthly averages when viewing "overall" or "1year"
  const displayTrends = useMemo(() => {
    if (!trends || (timeRange !== "overall" && timeRange !== "1year")) return trends;

    const monthMap = new Map<string, { green: number[], amber: number[], red: number[], totalDays: number, date: string }>();

    // Include ALL days from the trends data
    trends.forEach(day => {
      const date = new Date(day.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          green: [],
          amber: [],
          red: [],
          totalDays: 0,
          date: monthKey + '-01'
        });
      }

      const month = monthMap.get(monthKey)!;
      month.green.push(day.green);
      month.amber.push(day.amber);
      month.red.push(day.red);
      month.totalDays++;
    });

    // Calculate averages and convert to array
    return Array.from(monthMap.values())
      .map(month => {
        // Sum all values and divide by total days in the month (keep as decimal, don't round yet)
        const totalGreen = month.green.reduce((a, b) => a + b, 0);
        const totalAmber = month.amber.reduce((a, b) => a + b, 0);
        const totalRed = month.red.reduce((a, b) => a + b, 0);

        const green = totalGreen / month.totalDays;
        const amber = totalAmber / month.totalDays;
        const red = totalRed / month.totalDays;
        const total = green + amber + red;

        return {
          date: month.date,
          green,
          amber,
          red,
          total,
          greenPercent: total > 0 ? Math.round((green / total) * 100) : 0,
          amberPercent: total > 0 ? Math.round((amber / total) * 100) : 0,
          redPercent: total > 0 ? Math.round((red / total) * 100) : 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12); // Only show last 12 months
  }, [trends, timeRange]);

  if (viewer === undefined || isLoading) {
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
    <div className="flex flex-col gap-10 px-8 py-8 mx-auto w-full max-w-[80%]">
      <div className="text-center">
        <h1 className="font-bold text-3xl text-slate-900 dark:text-slate-100 mb-3">
          Welcome {viewer ?? "Anonymous"}!
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-lg">
          Here is your organization's wellbeing dashboard.
        </p>
      </div>

      {/* Color Key Legend */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
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

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-32">
        {/* LEFT COLUMN - Graphs (3/4 width) */}
        <div className="lg:col-span-3 flex flex-col gap-8">
          {/* Time Range Toggle */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
              Time Range Filter
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
            <MoodGraph trends={displayTrends || []} totalPeople={employees?.length || 0} isMonthly={timeRange === "overall" || timeRange === "1year"} />
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-700 my-4"></div>

          {/* Group Filter and Graph */}
          {groups.length > 0 && (
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

              {/* Selected Group Mood Graph */}
              {selectedGroupId && (
                <div className="flex flex-col gap-6">
                  <h2 className="font-bold text-2xl text-slate-900 dark:text-slate-100 text-center border-b-2 border-slate-300 dark:border-slate-600 pb-3">
                    {groups.find(g => g._id === selectedGroupId)?.name} Mood {(timeRange === "overall" || timeRange === "1year") && "(Monthly Average)"}
                  </h2>
                  <GroupMoodGraph groupId={selectedGroupId} groupName={groups.find(g => g._id === selectedGroupId)?.name || ""} days={days} timeRange={timeRange} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Recent Comments (1/3 width) */}
        <div className="flex flex-col gap-6">
          {/* Spacer to align with Overall Organization Mood heading */}
          <div className="h-[88px]"></div>

          <h2 className="font-bold text-2xl text-slate-900 dark:text-slate-100 border-b-2 border-slate-300 dark:border-slate-600 pb-3">
            Recent Check-ins
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 -mt-3">
            Last 24 hours
          </p>
          <div className="flex flex-col gap-4 max-h-[800px] overflow-y-auto pr-2">
            {sortedCheckins.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                No check-ins in the last 24 hours.
              </p>
            ) : (
              sortedCheckins.map((checkin: any) => (
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
                      "{checkin.note}"
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
        </div>
      </div>
    </div>
  );
}

// Reusable Mood Graph Component
function MoodGraph({ trends, totalPeople, isMonthly = false }: { trends: any[]; totalPeople: number; isMonthly?: boolean }) {
  // Y-axis should go up to total number of people
  const maxY = totalPeople || 1; // Avoid division by zero
  // Adjust y-axis steps based on group size to prevent duplicate labels
  const yAxisSteps = Math.min(maxY, 5);
  const stepValue = maxY / yAxisSteps;

  // Calculate dynamic graph width based on number of bars (40px per bar)
  const graphWidth = trends.length * 40;
  // Total container width = y-axis labels (64px) + graph width + padding (48px)
  const containerWidth = graphWidth + 112;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mx-auto" style={{ width: `${containerWidth}px` }}>
      {/* Graph Container */}
      <div className="relative h-80 flex justify-center">
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
              const noResponse = maxY - day.total;
              const greenHeight = maxY > 0 ? (day.green / maxY) * 100 : 0;
              const amberHeight = maxY > 0 ? (day.amber / maxY) * 100 : 0;
              const redHeight = maxY > 0 ? (day.red / maxY) * 100 : 0;
              const noResponseHeight = maxY > 0 ? (noResponse / maxY) * 100 : 0;

              return (
                <div
                  key={index}
                  className={`w-10 flex flex-col items-center justify-end group relative h-full ${index === 0 ? 'pr-0.5' : index === trends.length - 1 ? 'pl-0.5' : 'px-0.5'}`}
                >
                  {/* Tooltip on hover */}
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
                    <div className="border-t border-slate-600 mt-1 pt-1">Total: {isMonthly ? day.total.toFixed(1) : Math.round(day.total)}/{totalPeople}</div>
                  </div>

                  {/* Stacked bars */}
                  <div className="w-full flex flex-col-reverse items-center h-full">
                    {/* Green - at top */}
                    {day.green > 0 && (
                      <div
                        className="w-full bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center text-xs font-semibold text-white"
                        style={{ height: `${greenHeight}%` }}
                      >
                        {greenHeight > 8 && (isMonthly ? day.green.toFixed(1) : Math.round(day.green))}
                      </div>
                    )}
                    {/* Amber */}
                    {day.amber > 0 && (
                      <div
                        className="w-full bg-amber-500 hover:bg-amber-600 transition-colors flex items-center justify-center text-xs font-semibold text-white"
                        style={{ height: `${amberHeight}%` }}
                      >
                        {amberHeight > 8 && (isMonthly ? day.amber.toFixed(1) : Math.round(day.amber))}
                      </div>
                    )}
                    {/* Red */}
                    {day.red > 0 && (
                      <div
                        className="w-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center text-xs font-semibold text-white"
                        style={{ height: `${redHeight}%` }}
                      >
                        {redHeight > 8 && (isMonthly ? day.red.toFixed(1) : Math.round(day.red))}
                      </div>
                    )}
                    {/* No Response (Grey) - at bottom */}
                    {noResponse > 0 && (
                      <div
                        className="w-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200"
                        style={{ height: `${noResponseHeight}%` }}
                      >
                        {noResponseHeight > 8 && (isMonthly ? noResponse.toFixed(1) : Math.round(noResponse))}
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
      <div className="flex mt-2 justify-center">
        <div className="w-12 pr-4"></div>
        <div className="flex border-l-2 border-transparent" style={{ width: `${graphWidth}px` }}>
          {trends.map((day, index) => {
            // For monthly view, show all labels; for daily, show selectively
            const showLabel = isMonthly ? true :
                             trends.length <= 7 ? true :
                             trends.length <= 14 ? index % 2 === 0 :
                             trends.length <= 30 ? index % 3 === 0 :
                             index % 7 === 0 || index === trends.length - 1;

            return (
              <div
                key={index}
                className="w-10 text-center text-xs text-slate-600 dark:text-slate-400 px-1"
              >
                {showLabel && new Date(day.date).toLocaleDateString("en-US", isMonthly ? {
                  month: "short",
                  year: "2-digit",
                } : {
                  month: "short",
                  day: "numeric",
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Group-Specific Mood Graph Component
function GroupMoodGraph({ groupId, groupName, days, timeRange }: { groupId: Id<"groups">; groupName: string; days: number; timeRange: "1week" | "1month" | "1year" | "overall" }) {
  const trends = useQuery(api.moodCheckins.getGroupTrends, { groupId, days });
  const members = useQuery(api.groups.getMembers, { groupId });

  // Aggregate into monthly averages when viewing "overall" or "1year"
  const displayTrends = useMemo(() => {
    if (!trends || (timeRange !== "overall" && timeRange !== "1year")) return trends;

    const monthMap = new Map<string, { green: number[], amber: number[], red: number[], totalDays: number, date: string }>();

    // Include ALL days from the trends data
    trends.forEach(day => {
      const date = new Date(day.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          green: [],
          amber: [],
          red: [],
          totalDays: 0,
          date: monthKey + '-01'
        });
      }

      const month = monthMap.get(monthKey)!;
      month.green.push(day.green);
      month.amber.push(day.amber);
      month.red.push(day.red);
      month.totalDays++;
    });

    // Calculate averages and convert to array
    return Array.from(monthMap.values())
      .map(month => {
        // Sum all values and divide by total days in the month (keep as decimal, don't round yet)
        const totalGreen = month.green.reduce((a, b) => a + b, 0);
        const totalAmber = month.amber.reduce((a, b) => a + b, 0);
        const totalRed = month.red.reduce((a, b) => a + b, 0);

        const green = totalGreen / month.totalDays;
        const amber = totalAmber / month.totalDays;
        const red = totalRed / month.totalDays;
        const total = green + amber + red;

        return {
          date: month.date,
          green,
          amber,
          red,
          total,
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
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mx-auto" style={{ maxWidth: "fit-content" }}>
        <h3 className="font-bold text-xl text-slate-900 dark:text-slate-100 mb-6 text-center border-b border-slate-200 dark:border-slate-600 pb-3">{groupName}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto" style={{ width: "fit-content" }}>
      <h3 className="font-bold text-xl text-slate-900 dark:text-slate-100 mb-6 text-center">{groupName}</h3>
      <MoodGraph trends={displayTrends || []} totalPeople={members?.length || 0} isMonthly={timeRange === "overall" || timeRange === "1year"} />
    </div>
  );
}
