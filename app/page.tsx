"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  // Redirect authenticated users to manager
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/manager");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 w-full h-screen justify-center items-center px-4">
        <div className="flex items-center gap-6">
          <Image src="/smile.png" alt="Smile Logo" width={90} height={90} />
          <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
        </div>
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Image src="/smile.png" alt="R u OK Logo" width={40} height={40} />
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">
              R u OK?
            </h1>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => router.push("/signin")} variant="outline">
              Sign In
            </Button>
            <Button
              onClick={() => router.push("/signin?flow=signup")}
              variant="default"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="flex justify-center gap-8 mb-8">
          <Image
            src="/smile.png"
            alt="Smile"
            width={120}
            height={120}
            className="animate-pulse"
          />
          <div className="w-px bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Concerned" width={120} height={120} />
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-slate-900 dark:text-slate-100 mb-6">
          Check in on your team's wellbeing
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10">
          A simple daily check-in system that helps organizations monitor and
          support their team's mental health and wellbeing.
        </p>
      </section>

      {/* How It Works */}
      <section className="bg-white dark:bg-slate-800 py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-slate-100 mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center p-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl">📱</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Daily Check-In
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Receive a daily notification or email reminder asking "Are you
                okay?" Select red, amber, or green to indicate how you're
                feeling.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl">💭</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Optional Notes
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Add a personal note to your check-in. Choose to keep it private
                or share it with your team to foster open communication.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl">📊</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Track & Support
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                View dashboards showing sentiment trends for yourself, your
                team, and the entire organization over time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-slate-100 mb-12">
            Features
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                🏢 Flexible Organization Structure
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Create infinitely nested groups and divisions that reflect your
                company's structure. Team members can belong to multiple groups.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                🚦 Simple Traffic Light System
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Red, amber, green - it's that simple. Quick daily check-ins that
                take seconds but provide valuable insights.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                📈 Comprehensive Dashboards
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Monitor wellbeing trends at individual, team, and organization
                levels. Identify patterns and take proactive action.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                🔔 Smart Reminders
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Push notifications or email reminders ensure consistent
                check-ins without being intrusive.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                🔒 Privacy First
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Personal notes are private by default. Users control what they
                share with their team.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                ⏱️ Real-Time Insights
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                See how your team is doing right now. Identify who might need
                support before it's too late.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-800 dark:to-purple-800 py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to support your team's wellbeing?
          </h2>
          <p className="text-xl text-blue-100">
            Join organizations that prioritize mental health and create a culture
            of care.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 dark:bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex justify-center items-center gap-3 mb-4">
            <Image src="/smile.png" alt="R u OK Logo" width={32} height={32} />
            <span className="text-xl font-semibold text-slate-200">R u OK?</span>
          </div>
          <p className="text-slate-400 mb-4">
            Supporting workplace wellbeing, one check-in at a time.
          </p>
          <p className="text-slate-500 text-sm">
            © 2025 R u OK. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
