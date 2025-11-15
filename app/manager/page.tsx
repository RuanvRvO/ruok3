"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ManagerPage() {
  const router = useRouter();

  // Redirect to view page by default
  useEffect(() => {
    router.push("/manager/view");
  }, [router]);

  return null;
}
