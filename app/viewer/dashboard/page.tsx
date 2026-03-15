"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function ViewerDashboard() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/signin");
      return;
    }
    router.replace("/manager/view");
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)`,
        backgroundSize: '24px 24px'
      }}></div>
      <div className="absolute top-20 left-10 w-64 h-64 bg-green-400/20 dark:bg-green-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
      <div className="relative z-10 flex items-center justify-center min-h-screen">
        <LoadingSpinner message="Loading..." />
      </div>
    </div>
  );
}
