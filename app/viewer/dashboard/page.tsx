"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ViewerDashboard() {
  const router = useRouter();

  useEffect(() => {
    // Check if viewer is logged in
    const viewerSession = localStorage.getItem("viewerSession");

    if (!viewerSession) {
      // Redirect to sign in if no session
      router.push("/signin?viewer=true");
      return;
    }

    // Redirect to manager view page (viewers use the same view page)
    router.push("/manager/view");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
        <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
        <p className="ml-2 text-slate-600 dark:text-slate-400">Loading...</p>
      </div>
    </div>
  );
}
