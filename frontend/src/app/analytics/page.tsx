"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { SkeletonRow } from "@/components/ui/Skeleton";

const InstituteAnalyticsTab = dynamic(
  () => import("@/components/analytics/InstituteAnalyticsTab").then((m) => m.InstituteAnalyticsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={6} /></div> }
);
const StudentAnalyticsTab = dynamic(
  () => import("@/components/analytics/StudentAnalyticsTab").then((m) => m.StudentAnalyticsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={6} /></div> }
);

const TABS = [
  { id: "institute", label: "Institute" },
  { id: "students", label: "Students" },
];

export default function AnalyticsPage() {
  const [tab, setTab] = useState<string>("institute");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How the institute is actually doing — enrollment, attendance, test performance, and money, in one place.
        </p>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      {tab === "institute" ? <InstituteAnalyticsTab /> : <StudentAnalyticsTab />}
    </div>
  );
}
