"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { CoursesTab } from "@/components/academics/CoursesTab";
import { SubjectsTab } from "@/components/academics/SubjectsTab";
import { BatchesTab } from "@/components/academics/BatchesTab";

const TABS = [
  { id: "courses", label: "Courses" },
  { id: "subjects", label: "Subjects" },
  { id: "batches", label: "Batches" },
];

export default function AcademicsPage() {
  const [tab, setTab] = useState("courses");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Academics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Courses, subjects and batches — the structure everything else in this institute hangs off of.
        </p>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      <div>
        {tab === "courses" && <CoursesTab />}
        {tab === "subjects" && <SubjectsTab />}
        {tab === "batches" && <BatchesTab />}
      </div>
    </div>
  );
}
