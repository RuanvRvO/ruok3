"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        // Redirect authenticated users to the manager page
        router.push("/manager");
      } else {
        // Redirect unauthenticated users to sign in
        router.push("/signin");
      }
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state while checking authentication
  return (
    <div className="flex flex-col gap-8 w-full h-screen justify-center items-center px-4">
      <div className="flex items-center gap-6">
        <Image
          src="/smile.png"
          alt="Smile Logo"
          width={90}
          height={90}
        />
        <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
        <Image
          src="/sad.png"
          alt="Sad Logo"
          width={90}
          height={90}
        />
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
