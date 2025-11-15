"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function ViewOrganizationPage() {
  const { viewer } =
    useQuery(api.myFunctions.listNumbers, {
      count: 10,
    }) ?? {};

  const trends = useQuery(api.moodCheckins.getTrends, { days: 7 });
  const todayCheckins = useQuery(api.moodCheckins.getTodayCheckins);

  const isLoading = trends === undefined || todayCheckins === undefined;

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

  // Get today's stats
  const today = trends[trends.length - 1];

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h2 className="font-bold text-2xl text-slate-800 dark:text-slate-200">
          Welcome {viewer ?? "Anonymous"}!
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Here is your organization's wellbeing dashboard.
        </p>
      </div>

      {/* Today's Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                Feeling Great
              </p>
              <p className="text-3xl font-bold text-green-900 dark:text-green-100 mt-2">
                {today?.green || 0}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {today?.greenPercent || 0}% of team
              </p>
            </div>
            <div className="text-4xl">😊</div>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Feeling Okay
              </p>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-100 mt-2">
                {today?.amber || 0}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {today?.amberPercent || 0}% of team
              </p>
            </div>
            <div className="text-4xl">😐</div>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Need Support
              </p>
              <p className="text-3xl font-bold text-red-900 dark:text-red-100 mt-2">
                {today?.red || 0}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {today?.redPercent || 0}% of team
              </p>
            </div>
            <div className="text-4xl">😔</div>
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-200 dark:bg-slate-700"></div>

      {/* 7-Day Trend */}
      <div className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl text-slate-800 dark:text-slate-200">
          7-Day Mood Trend
        </h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Track your organization's wellbeing over the past week.
        </p>

        {/* Simple Bar Chart */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <div className="space-y-4">
            {trends.map((day, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {new Date(day.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {day.total} responses
                  </span>
                </div>
                {day.total > 0 ? (
                  <div className="flex h-8 rounded-lg overflow-hidden">
                    {day.green > 0 && (
                      <div
                        className="bg-green-500 flex items-center justify-center text-white text-xs font-semibold"
                        style={{ width: `${day.greenPercent}%` }}
                        title={`${day.green} green (${day.greenPercent}%)`}
                      >
                        {day.greenPercent > 15 && `${day.green}`}
                      </div>
                    )}
                    {day.amber > 0 && (
                      <div
                        className="bg-amber-500 flex items-center justify-center text-white text-xs font-semibold"
                        style={{ width: `${day.amberPercent}%` }}
                        title={`${day.amber} amber (${day.amberPercent}%)`}
                      >
                        {day.amberPercent > 15 && `${day.amber}`}
                      </div>
                    )}
                    {day.red > 0 && (
                      <div
                        className="bg-red-500 flex items-center justify-center text-white text-xs font-semibold"
                        style={{ width: `${day.redPercent}%` }}
                        title={`${day.red} red (${day.redPercent}%)`}
                      >
                        {day.redPercent > 15 && `${day.red}`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                    <span className="text-xs text-slate-400">No responses</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Feeling Great
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Feeling Okay
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Need Support
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-slate-200 dark:bg-slate-700"></div>

      {/* Today's Check-ins */}
      <div className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl text-slate-800 dark:text-slate-200">
          Today's Check-ins
        </h2>
        {todayCheckins.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">
            No check-ins yet today.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {todayCheckins.map((checkin: any) => (
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
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {checkin.employeeName}
                  </span>
                  <span className="text-2xl">
                    {checkin.mood === "green" ? "😊" : checkin.mood === "amber" ? "😐" : "😔"}
                  </span>
                </div>
                {checkin.note && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                    "{checkin.note}"
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
