"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { api } from "../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  // Only query organizations if authenticated
  const organizations = useQuery(
    api.organizationMemberships.getUserOrganizations,
    isAuthenticated ? {} : "skip"
  );

  // Derive the "waiting for approval" state from auth and organizations
  // This avoids calling setState in useEffect
  const showWaitingMessage = !isLoading && isAuthenticated && organizations !== undefined && organizations.length === 0;

  // Redirect authenticated users with organizations to manager view
  useEffect(() => {
    if (!isLoading && isAuthenticated && organizations !== undefined && organizations.length > 0) {
      router.push("/manager/view");
    }
  }, [isAuthenticated, isLoading, organizations, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full min-h-screen justify-center items-center px-4 py-6 sm:py-8 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
          <Image src="/smile.png" alt="Smile Logo" width={90} height={90} className="w-16 h-16 sm:w-18 sm:h-18 md:w-[90px] md:h-[90px] object-contain" />
          <div className="w-px h-12 sm:h-16 md:h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Sad Logo" width={90} height={90} className="w-14 h-14 sm:w-16 sm:h-16 md:w-[90px] md:h-[90px] object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
          <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
          <p className="ml-2 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Hero Section - Gradient Background */}
      <section className="relative py-20 sm:py-28 px-4 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800"></div>
        <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.4) 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }}></div>
        {/* Decorative Blobs */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-green-200/40 dark:bg-green-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-200/40 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        
        <div className="relative max-w-3xl mx-auto text-center">
          {/* Logo */}
          <div className="flex justify-center items-center gap-6 mb-8">
            <Image src="/smile.png" alt="Smile" width={80} height={80} className="object-contain drop-shadow-lg" />
            <div className="w-px h-16 bg-slate-300 dark:bg-slate-600"></div>
            <Image src="/sad.png" alt="Concerned" width={80} height={80} className="object-contain drop-shadow-lg" />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Team Wellbeing Check-ins
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 max-w-xl mx-auto">
            A simple tool for organizations to monitor and support their team&apos;s mental health through daily check-ins.
          </p>

          {/* Waiting for approval message for signed-in users without organizations */}
          {showWaitingMessage && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-8 max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-800/50 rounded-full flex items-center justify-center">
                  <span className="text-xl">⏳</span>
                </div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-300">Waiting for Access</h3>
              </div>
              <p className="text-amber-700 dark:text-amber-400 text-sm mb-4">
                Your account has been created, but you don&apos;t have access to any organizations yet. 
                If you&apos;ve requested access, please wait for approval from the organization owner.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => router.push("/select-organization")}
                  size="sm"
                  variant="outline"
                  className="flex-1 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                >
                  Create Organization
                </Button>
                <Button
                  onClick={() => {
                    void signOut().then(() => {
                      localStorage.removeItem("selectedOrganization");
                    });
                  }}
                  size="sm"
                  variant="ghost"
                  className="flex-1 text-amber-700 dark:text-amber-400"
                >
                  Sign Out
                </Button>
              </div>
            </div>
          )}

          {/* Centered Action Buttons - only show if not waiting for approval */}
          {!showWaitingMessage && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => router.push("/signin?flow=signup")}
                size="lg"
                className="px-8 text-base font-semibold shadow-lg hover:shadow-xl transition-shadow"
              >
                Get Started
              </Button>
              <Button
                onClick={() => router.push("/signin")}
                variant="outline"
                size="lg"
                className="px-8 text-base font-semibold bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm"
              >
                Sign In
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* How It Works - Traffic Light Gradient */}
      <section className="relative py-20 px-4 bg-white dark:bg-slate-900">
        <div className="absolute inset-0 opacity-20 dark:opacity-10" style={{
          backgroundImage: `linear-gradient(to right, rgb(34 197 94), rgb(234 179 8), rgb(239 68 68))`
        }}></div>
        
        <div className="relative max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-900 dark:text-slate-100 mb-4">
            How It Works
          </h2>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-12 max-w-2xl mx-auto">
            Get your team started in minutes with our simple three-step process.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-green-500/20">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Daily Check-In</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Team members receive a simple daily prompt and respond with green, amber, or red to indicate how they&apos;re feeling.
              </p>
            </div>
            <div className="text-center bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-500/20">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Add Context</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Optionally add notes to provide context. Choose to keep them private or share with managers.
              </p>
            </div>
            <div className="text-center bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-400 to-violet-500 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-purple-500/20">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Track Trends</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Team can see aggregated insights and can identify team members who may need support.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features - Gradient Mesh Background */}
      <section className="relative py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-100/50 dark:bg-amber-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-sky-100/50 dark:bg-sky-500/5 rounded-full blur-3xl"></div>
        
        <div className="relative max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-900 dark:text-slate-100 mb-4">
            Features
          </h2>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-12 max-w-2xl mx-auto">
            Everything you need to support your team&apos;s mental health and wellbeing.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl">🚦</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Traffic Light System</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Simple red, amber, green responses make check-ins quick and easy.
              </p>
            </div>
            <div className="p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl">📊</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Team Dashboards</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Monitor wellbeing trends across teams and identify patterns over time.
              </p>
            </div>
            <div className="p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl">🔒</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Privacy Controls</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Users control what they share. Anonymous options available.
              </p>
            </div>
            <div className="p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl">🏢</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Flexible Structure</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Create groups and teams that match your organization&apos;s structure.
              </p>
            </div>
            <div className="p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl">📧</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Email Reminders</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Automated daily reminders ensure consistent participation.
              </p>
            </div>
            <div className="p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xl">⚡</span>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Real-Time Data</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                See responses as they come in. No waiting for reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Gradient */}
      <section className="relative py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"></div>
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgb(148 163 184 / 0.3) 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}></div>
        
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Ready to support your team?
          </h2>
          <p className="text-slate-400">
            Start monitoring your team&apos;s wellbeing today.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 dark:bg-slate-950 py-10 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Image src="/smile.png" alt="R u OK Logo" width={28} height={28} className="object-contain" />
            <span className="font-semibold text-white">R u OK?</span>
          </div>
          <p className="text-sm text-slate-500">
            © 2025 R u OK. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
