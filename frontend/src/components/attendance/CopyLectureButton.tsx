"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { resolveMessageTemplate } from "@/lib/useMessageTemplate";
import {
  attendanceMarkedVars,
  isFullyMarked,
  lectureCancelledVars,
  lectureScheduledVars,
  renderTemplate,
} from "@/lib/messageTemplates";
import type { Lecture, RosterEntry } from "@/lib/types";

function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Icon button that copies the right WhatsApp-ready message for a lecture's
 * current state — cancelled, fully marked, or just scheduled — without the
 * caller having to track which state it's in. */
export function CopyLectureButton({ lecture }: { lecture: Lecture }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");

  async function handleCopy() {
    setState("busy");
    try {
      let type: "LECTURE_SCHEDULED" | "LECTURE_CANCELLED" | "ATTENDANCE_MARKED";
      let vars: Record<string, string>;

      if (lecture.cancelled) {
        type = "LECTURE_CANCELLED";
        vars = lectureCancelledVars(lecture);
      } else {
        const roster = await apiFetch<RosterEntry[]>(`/attendance/lectures/${lecture.id}/roster`);
        if (isFullyMarked(roster)) {
          type = "ATTENDANCE_MARKED";
          vars = attendanceMarkedVars(lecture, roster);
        } else {
          type = "LECTURE_SCHEDULED";
          vars = lectureScheduledVars(lecture);
        }
      }

      const template = await resolveMessageTemplate(type);
      await navigator.clipboard.writeText(renderTemplate(template, vars));
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={state === "busy"}
      aria-label="Copy WhatsApp message"
      title={state === "error" ? "Could not copy" : "Copy WhatsApp message"}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
        state === "copied" ? "bg-success-soft text-success" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {state === "copied" ? <CheckIcon /> : <ClipboardIcon />}
    </button>
  );
}
