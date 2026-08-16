"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ListSection } from "@/components/dashboard/ListSection";
import { MarkAttendanceModal } from "@/components/attendance/MarkAttendanceModal";
import type { Lecture } from "@/lib/types";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

const ICON_CLOCK = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function UpcomingLecturesWidget() {
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [markLecture, setMarkLecture] = useState<Lecture | null>(null);

  function load() {
    apiFetch<Lecture[]>("/attendance/lectures?scope=upcoming&limit=2")
      .then(setLectures)
      .catch(() => setLectures([]));
  }

  useEffect(load, []);

  return (
    <>
      <ListSection
        title="Upcoming lectures"
        viewAllHref="/attendance"
        emptyLabel="No upcoming lectures scheduled."
        items={lectures.map((l) => ({
          key: l.id,
          icon: ICON_CLOCK,
          title: `${l.subject.name} · ${l.batch.name}`,
          subtitle: `${fmtDate(l.date)} · ${l.startTime}–${l.endTime}`,
          onClick: () => setMarkLecture(l),
        }))}
      />
      <MarkAttendanceModal
        lecture={markLecture}
        onClose={() => setMarkLecture(null)}
        onMarked={() => {
          load();
        }}
      />
    </>
  );
}
