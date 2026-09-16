"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { SkeletonRow } from "@/components/ui/Skeleton";
import type { AcademicsTabHandle } from "@/components/academics/tabHandle";

const CoursesTab = dynamic(
  () => import("@/components/academics/CoursesTab").then((m) => m.CoursesTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const SubjectsTab = dynamic(
  () => import("@/components/academics/SubjectsTab").then((m) => m.SubjectsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const BatchesTab = dynamic(
  () => import("@/components/academics/BatchesTab").then((m) => m.BatchesTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const FeeStructuresTab = dynamic(
  () => import("@/components/academics/FeeStructuresTab").then((m) => m.FeeStructuresTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const RoomsTab = dynamic(
  () => import("@/components/academics/RoomsTab").then((m) => m.RoomsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const MaterialsTab = dynamic(
  () => import("@/components/academics/MaterialsTab").then((m) => m.MaterialsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);

type TabId = "courses" | "subjects" | "batches" | "fee-structures" | "rooms" | "materials";

const TABS: { id: TabId; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "subjects", label: "Subjects" },
  { id: "batches", label: "Batches" },
  { id: "fee-structures", label: "Fee structures" },
  { id: "rooms", label: "Rooms & Labs" },
  { id: "materials", label: "Study Materials & Homework" },
];

// One label per tab for the page-level create button — matches Enquiries'
// and Admissions' "title + primary action" header instead of burying the
// action inside each tab's own card, and keeps it in the same place as the
// tab changes rather than jumping around.
const CREATE_LABEL: Partial<Record<TabId, string>> = {
  courses: "New course",
  subjects: "New subject",
  batches: "New batch",
  "fee-structures": "New fee structure",
  materials: "New material",
};

export default function AcademicsPage() {
  const [tab, setTab] = useState<TabId>("courses");

  // Each tab owns its own create-modal state; the ref just gives this page a
  // way to trigger whichever tab is currently visible from one shared button.
  const coursesRef = useRef<AcademicsTabHandle>(null);
  const subjectsRef = useRef<AcademicsTabHandle>(null);
  const batchesRef = useRef<AcademicsTabHandle>(null);
  const feeStructuresRef = useRef<AcademicsTabHandle>(null);
  const materialsRef = useRef<AcademicsTabHandle>(null);

  function handleCreate() {
    const handleMap: Record<string, React.RefObject<AcademicsTabHandle | null>> = {
      courses: coursesRef,
      subjects: subjectsRef,
      batches: batchesRef,
      "fee-structures": feeStructuresRef,
      materials: materialsRef,
    };
    const handle = handleMap[tab];
    handle?.current?.openCreate();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Academics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Courses, subjects, batches, fee structures, study materials, and classrooms — the structure everything else in this institute hangs off of.
          </p>
        </div>
        {CREATE_LABEL[tab] && <Button onClick={handleCreate}>{CREATE_LABEL[tab]}</Button>}
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} />

      <div>
        {tab === "courses" && <CoursesTab ref={coursesRef} />}
        {tab === "subjects" && <SubjectsTab ref={subjectsRef} />}
        {tab === "batches" && <BatchesTab ref={batchesRef} />}
        {tab === "fee-structures" && <FeeStructuresTab ref={feeStructuresRef} />}
        {tab === "rooms" && <RoomsTab canManage={true} />}
        {tab === "materials" && <MaterialsTab ref={materialsRef} />}
      </div>
    </div>
  );
}
