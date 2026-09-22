"use client";

import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/types";
import { haptic } from "@/lib/haptics";

const TONE_CLASSES: Record<(typeof ATTENDANCE_STATUSES)[number], string> = {
  PRESENT: "data-[active=true]:bg-success data-[active=true]:text-success-foreground",
  ABSENT: "data-[active=true]:bg-danger data-[active=true]:text-danger-foreground",
  LEAVE: "data-[active=true]:bg-warning data-[active=true]:text-warning-foreground",
  LATE: "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground",
};

export function AttendanceToggleGroup({
  value,
  onChange,
  disabled = false,
}: {
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 w-full sm:w-80 gap-1 rounded-lg bg-muted p-1">
      {ATTENDANCE_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          data-active={value === s}
          onClick={() => {
            if (!disabled) {
              haptic.tick();
              onChange(s);
            }
          }}
          className={`flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${TONE_CLASSES[s]}`}
        >
          {ATTENDANCE_STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
