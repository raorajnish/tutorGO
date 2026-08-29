"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { CoursesTab } from "@/components/academics/CoursesTab";
import { SubjectsTab } from "@/components/academics/SubjectsTab";
import { BatchesTab } from "@/components/academics/BatchesTab";
import { FeeStructuresTab } from "@/components/academics/FeeStructuresTab";
import type { AcademicsTabHandle } from "@/components/academics/tabHandle";

type TabId = "courses" | "subjects" | "batches" | "fee-structures";

const TABS: { id: TabId; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "subjects", label: "Subjects" },
  { id: "batches", label: "Batches" },
  { id: "fee-structures", label: "Fee structures" },
];

// One label per tab for the page-level create button — matches Enquiries'
// and Admissions' "title + primary action" header instead of burying the
// action inside each tab's own card, and keeps it in the same place as the
// tab changes rather than jumping around.
const CREATE_LABEL: Record<TabId, string> = {
  courses: "New course",
  subjects: "New subject",
  batches: "New batch",
  "fee-structures": "New fee structure",
};

export default function AcademicsPage() {
  const [tab, setTab] = useState<TabId>("courses");

  // Each tab owns its own create-modal state; the ref just gives this page a
  // way to trigger whichever tab is currently visible from one shared button.
  const coursesRef = useRef<AcademicsTabHandle>(null);
  const subjectsRef = useRef<AcademicsTabHandle>(null);
  const batchesRef = useRef<AcademicsTabHandle>(null);
  const feeStructuresRef = useRef<AcademicsTabHandle>(null);

  function handleCreate() {
    const handle = { courses: coursesRef, subjects: subjectsRef, batches: batchesRef, "fee-structures": feeStructuresRef }[tab];
    handle.current?.openCreate();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Academics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Courses, subjects and batches — the structure everything else in this institute hangs off of.
          </p>
        </div>
        <Button onClick={handleCreate}>{CREATE_LABEL[tab]}</Button>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} />

      <div>
        {tab === "courses" && <CoursesTab ref={coursesRef} />}
        {tab === "subjects" && <SubjectsTab ref={subjectsRef} />}
        {tab === "batches" && <BatchesTab ref={batchesRef} />}
        {tab === "fee-structures" && <FeeStructuresTab ref={feeStructuresRef} />}
      </div>
    </div>
  );
}
