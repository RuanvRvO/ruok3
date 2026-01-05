"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Id } from "../../convex/_generated/dataModel";

export default function MoodResponsePage() {
  const searchParams = useSearchParams();
  const employeeId = searchParams.get("employeeId");
  const mood = searchParams.get("mood") as "green" | "amber" | "red" | null;

  const [note, setNote] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [autoSaved, setAutoSaved] = useState(false);

  const recordMood = useMutation(api.moodCheckins.record);
  const updateDetails = useMutation(api.moodCheckins.updateDetails);
  const hasSubmittedToday = useQuery(
    api.moodCheckins.hasSubmittedToday,
    employeeId ? { employeeId: employeeId as Id<"employees"> } : "skip"
  );

  // Check if already submitted and auto-save mood
  useEffect(() => {
    const saveMood = async () => {
      if (!employeeId || !mood || !["green", "amber", "red"].includes(mood)) {
        setError("Invalid link. Please check your email for the correct link.");
        return;
      }

      if (autoSaved) return; // Prevent duplicate saves

      // Wait for hasSubmittedToday query to load
      if (hasSubmittedToday === undefined) return;

      // Check if already submitted today
      if (hasSubmittedToday) {
        setError("ALREADY_SUBMITTED");
        return;
      }

      try {
        await recordMood({
          employeeId: employeeId as Id<"employees">,
          mood: mood,
        });
        setAutoSaved(true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "";
          if (errMsg.includes("ALREADY_SUBMITTED_TODAY")) {
            setError("ALREADY_SUBMITTED");
          } else {
            const msg = errMsg || "";
            const isNetwork = msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch");
            setError(
              msg ||
                (isNetwork
                  ? "Network error while saving your response. Please check your connection and retry."
                  : "Could not save your response. Please retry in a moment.")
            );
          }
      }
    };

    saveMood();
  }, [employeeId, mood, recordMood, autoSaved, hasSubmittedToday]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;

    setIsSubmitting(true);
    try {
      await updateDetails({
        employeeId: employeeId as Id<"employees">,
        note: note.trim() || undefined,
        isAnonymous: isAnonymous,
      });
      // Close the tab after successful submission
      window.close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const isNetwork = msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch");
      setError(
        msg ||
          (isNetwork
            ? "Network error while submitting your details. Please check your connection and retry."
            : "Could not submit your details. Please retry in a moment.")
      );
      setIsSubmitting(false);
    }
  };

  const handleExit = () => {
    window.close();
  };

  const getMoodEmoji = () => {
    if (mood === "green") return "😊";
    if (mood === "amber") return "😐";
    if (mood === "red") return "😔";
    return "";
  };

  const getMoodColor = () => {
    if (mood === "green") return "from-green-500 to-green-600";
    if (mood === "amber") return "from-amber-500 to-amber-600";
    if (mood === "red") return "from-red-500 to-red-600";
    return "from-slate-500 to-slate-600";
  };

  const getMoodText = () => {
    if (mood === "green") return "I'm doing great!";
    if (mood === "amber") return "I'm okay";
    if (mood === "red") return "I need support";
    return "";
  };

  if (error === "ALREADY_SUBMITTED") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 sm:p-10 md:p-12 max-w-md text-center shadow-2xl">
          <div className="text-6xl mb-6">📝</div>
          <h1 className="text-3xl font-bold text-slate-800 mb-4">Already Submitted</h1>
          <p className="text-lg text-slate-600 mb-6">
            You have already submitted your response for today. Only 1 response per day is recorded.
          </p>
          <p className="text-sm text-slate-500">
            Thank you for checking in with us!
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 sm:p-10 md:p-12 max-w-md text-center shadow-2xl">
          <div className="text-6xl mb-6">⚠️</div>
          <h1 className="text-3xl font-bold text-slate-800 mb-4">Oops!</h1>
          <p className="text-lg text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  // Show note form after auto-save
  if (autoSaved) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${getMoodColor()} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-2xl p-6 sm:p-10 md:p-12 max-w-md w-full shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">{getMoodEmoji()}</div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Would you like to provide more details?</h1>
          </div>

          <form onSubmit={handleAddNote} className="space-y-6">
            <div>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none text-slate-700"
                placeholder="Share any thoughts or concerns (optional)..."
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-sm font-medium text-slate-700">Keep my response anonymous</span>
              <button
                type="button"
                role="switch"
                aria-checked={isAnonymous}
                onClick={() => setIsAnonymous(!isAnonymous)}
                disabled={isSubmitting}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                  isAnonymous ? "bg-green-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isAnonymous ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleExit}
                disabled={isSubmitting}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-medium py-3 rounded-lg"
              >
                Exit page
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-lg"
              >
                {isSubmitting ? "Submitting..." : "Submit response"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Loading state while saving
  return (
    <div className={`min-h-screen bg-gradient-to-br ${getMoodColor()} flex items-center justify-center p-4`}>
      <div className="bg-white rounded-2xl p-6 sm:p-10 md:p-12 max-w-md text-center shadow-2xl">
        <div className="text-6xl mb-6">{getMoodEmoji()}</div>
        <h1 className="text-3xl font-bold text-slate-800 mb-4">Recording your response...</h1>
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
          <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
        </div>
      </div>
    </div>
  );
}
