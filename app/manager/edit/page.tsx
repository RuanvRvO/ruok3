"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function EditOrganizationPage() {
  const { viewer } =
    useQuery(api.myFunctions.listNumbers, {
      count: 10,
    }) ?? {};

  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto">
      <div>
        <h2 className="font-bold text-xl text-slate-800 dark:text-slate-200">
          Make Changes - {viewer ?? "Anonymous"}
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          This is where you can make changes to your organization. Customize this content however you like!
        </p>
      </div>
    </div>
  );
}
