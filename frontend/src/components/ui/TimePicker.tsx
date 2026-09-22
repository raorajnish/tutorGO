"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface TimePickerProps {
  value?: string; // HH:mm (24-hour string format, e.g. "14:30")
  onChange?: (value: string) => void;
  label?: ReactNode;
  error?: string;
  required?: boolean;
  requiredStar?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
}

/** Utility to parse "HH:mm" to 12h parts */
function parseTime24(hhmm?: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) {
    const now = new Date();
    let h = now.getHours();
    const m = Math.round(now.getMinutes() / 5) * 5 % 60;
    const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return { hour12: h12, minute: m, period };
  }
  const [h, m] = hhmm.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: m, period };
}

/** Format 12h components back to "HH:mm" (24h) */
function formatTime24(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour12 % 12;
  if (period === "PM") h24 += 12;
  const hh = String(h24).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Format 12h components to display text like "02:00 PM" */
function formatTime12Display(hhmm?: string): string {
  if (!hhmm) return "";
  const { hour12, minute, period } = parseTime24(hhmm);
  const mm = String(minute).padStart(2, "0");
  return `${hour12}:${mm} ${period}`;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES_DIAL = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function TimePicker({
  value = "",
  onChange,
  label,
  error,
  required,
  requiredStar,
  disabled,
  placeholder = "Select time",
  className = "",
  id,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempTime, setTempTime] = useState(() => parseTime24(value));
  const [activeStep, setActiveStep] = useState<"hour" | "minute">("hour");
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);

  useEffect(() => {
    setTempTime(parseTime24(value));
  }, [value, isOpen]);

  const handleOpen = () => {
    if (disabled) return;
    setActiveStep("hour");
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleConfirm = () => {
    if (onChange) {
      const hhmm = formatTime24(tempTime.hour12, tempTime.minute, tempTime.period);
      onChange(hhmm);
    }
    setIsOpen(false);
  };

  const showStar = requiredStar ?? required;
  const displayFormattedText = value ? formatTime12Display(value) : "";

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-foreground flex items-center gap-0.5">
          <span>{label}</span>
          {showStar && <span className="text-accent font-semibold text-xs ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}

      {/* Trigger Button Field */}
      <div className="relative">
        <button
          type="button"
          id={id}
          disabled={disabled}
          onClick={handleOpen}
          className={`w-full flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-left text-foreground transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent ${
            disabled ? "opacity-60 cursor-not-allowed bg-muted/40" : "hover:border-primary/50 cursor-pointer"
          } ${error ? "border-danger" : ""} ${className}`}
        >
          <span className={displayFormattedText ? "text-foreground font-medium" : "text-muted-foreground"}>
            {displayFormattedText || placeholder}
          </span>
          <svg className="w-5 h-5 text-muted-foreground shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {error && <span className="text-xs text-danger">{error}</span>}

      {/* Responsive Modal Time Picker */}
      {isOpen && (
        <TimePickerModal
          isOpen={isOpen}
          tempTime={tempTime}
          setTempTime={setTempTime}
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          isKeyboardMode={isKeyboardMode}
          setIsKeyboardMode={setIsKeyboardMode}
          onClose={handleClose}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

interface TimePickerModalProps {
  isOpen: boolean;
  tempTime: { hour12: number; minute: number; period: "AM" | "PM" };
  setTempTime: React.Dispatch<React.SetStateAction<{ hour12: number; minute: number; period: "AM" | "PM" }>>;
  activeStep: "hour" | "minute";
  setActiveStep: (step: "hour" | "minute") => void;
  isKeyboardMode: boolean;
  setIsKeyboardMode: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  onConfirm: () => void;
}

function TimePickerModal({
  isOpen,
  tempTime,
  setTempTime,
  activeStep,
  setActiveStep,
  isKeyboardMode,
  setIsKeyboardMode,
  onClose,
  onConfirm,
}: TimePickerModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  // Handle clicking on hour/minute dial
  const selectHour = (h: number) => {
    setTempTime((prev) => ({ ...prev, hour12: h }));
    // Auto-switch to minute after selecting hour
    setTimeout(() => setActiveStep("minute"), 250);
  };

  const selectMinute = (m: number) => {
    setTempTime((prev) => ({ ...prev, minute: m }));
  };

  const togglePeriod = (p: "AM" | "PM") => {
    setTempTime((prev) => ({ ...prev, period: p }));
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-fadeIn">
      {/* Modal Dialog Card (Reference Image 2 Styling) */}
      <div
        className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div className="p-6 border-b border-border/40 bg-card">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">SELECT TIME</p>
          
          <div className="flex items-center justify-between gap-2">
            {/* Digital Display Box for Time */}
            <div className="flex items-center gap-2">
              {/* Hour Box */}
              <button
                type="button"
                onClick={() => setActiveStep("hour")}
                className={`flex h-16 w-20 items-center justify-center rounded-2xl text-4xl font-extrabold transition-all cursor-pointer ${
                  activeStep === "hour"
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/40"
                    : "bg-muted/50 text-foreground hover:bg-muted"
                }`}
              >
                {tempTime.hour12}
              </button>

              <span className="text-3xl font-bold text-muted-foreground animate-pulse">:</span>

              {/* Minute Box */}
              <button
                type="button"
                onClick={() => setActiveStep("minute")}
                className={`flex h-16 w-20 items-center justify-center rounded-2xl text-4xl font-extrabold transition-all cursor-pointer ${
                  activeStep === "minute"
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/40"
                    : "bg-muted/50 text-foreground hover:bg-muted"
                }`}
              >
                {String(tempTime.minute).padStart(2, "0")}
              </button>
            </div>

            {/* AM / PM Toggle Selector Block */}
            <div className="flex flex-col rounded-xl border border-border overflow-hidden bg-card shrink-0">
              <button
                type="button"
                onClick={() => togglePeriod("AM")}
                className={`px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  tempTime.period === "AM"
                    ? "bg-primary text-primary-foreground font-extrabold"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                AM
              </button>
              <div className="h-[1px] bg-border" />
              <button
                type="button"
                onClick={() => togglePeriod("PM")}
                className={`px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  tempTime.period === "PM"
                    ? "bg-primary text-primary-foreground font-extrabold"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                PM
              </button>
            </div>
          </div>
        </div>

        {/* Body Section: Dial View or Keyboard Input View */}
        <div className="p-6 flex items-center justify-center bg-card">
          {!isKeyboardMode ? (
            /* Circular Clock Dial (Reference Image 2) */
            <div ref={dialRef} className="relative w-60 h-60 rounded-full bg-slate-100/70 dark:bg-muted/30 flex items-center justify-center select-none shadow-inner">
              {/* Dial Center Dot */}
              <div className="w-2.5 h-2.5 rounded-full bg-primary z-20" />

              {/* Hand Line & Pointer Node */}
              <ClockHand activeStep={activeStep} tempTime={tempTime} />

              {/* Hour or Minute Radial Numbers */}
              {activeStep === "hour"
                ? HOURS.map((num) => {
                    const isSelected = tempTime.hour12 === num;
                    const angle = (num * 30 - 90) * (Math.PI / 180);
                    const radius = 92; // px radius
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => selectHour(num)}
                        style={{
                          transform: `translate(${x}px, ${y}px)`,
                        }}
                        className={`absolute w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors cursor-pointer z-10 ${
                          isSelected ? "text-white font-bold" : "text-foreground hover:text-primary"
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })
                : MINUTES_DIAL.map((num) => {
                    const isSelected = tempTime.minute === num;
                    const angle = ((num / 5) * 30 - 90) * (Math.PI / 180);
                    const radius = 92; // px radius
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => selectMinute(num)}
                        style={{
                          transform: `translate(${x}px, ${y}px)`,
                        }}
                        className={`absolute w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors cursor-pointer z-10 ${
                          isSelected ? "text-white font-bold" : "text-foreground hover:text-primary"
                        }`}
                      >
                        {String(num).padStart(2, "0")}
                      </button>
                    );
                  })}
            </div>
          ) : (
            /* Manual Keyboard Text Input Mode */
            <div className="w-full py-4 flex flex-col gap-4">
              <p className="text-xs text-muted-foreground text-center">Type time values directly:</p>
              <div className="flex items-center justify-center gap-3">
                <div className="flex flex-col gap-1 items-center">
                  <label className="text-xs text-muted-foreground">Hour (1-12)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={tempTime.hour12}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(12, Number(e.target.value) || 12));
                      setTempTime((prev) => ({ ...prev, hour12: val }));
                    }}
                    className="w-16 h-12 text-center rounded-xl border border-border bg-card text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <span className="text-2xl font-bold text-muted-foreground mt-4">:</span>
                <div className="flex flex-col gap-1 items-center">
                  <label className="text-xs text-muted-foreground">Minute (0-59)</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={tempTime.minute}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                      setTempTime((prev) => ({ ...prev, minute: val }));
                    }}
                    className="w-16 h-12 text-center rounded-xl border border-border bg-card text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/40 bg-card">
          {/* Keyboard Mode Toggle Button (Reference Image 2 bottom-left icon) */}
          <button
            type="button"
            onClick={() => setIsKeyboardMode((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            title={isKeyboardMode ? "Switch to Clock Dial" : "Switch to Keyboard Input"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-5 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors rounded-xl shadow-xs cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** SVG Component rendering line hand and blue circular node */
function ClockHand({
  activeStep,
  tempTime,
}: {
  activeStep: "hour" | "minute";
  tempTime: { hour12: number; minute: number; period: "AM" | "PM" };
}) {
  const center = 120; // 240px container center
  const radius = 92;

  let angleDeg = 0;
  if (activeStep === "hour") {
    angleDeg = tempTime.hour12 * 30 - 90;
  } else {
    angleDeg = (tempTime.minute / 5) * 30 - 90;
  }

  const angleRad = angleDeg * (Math.PI / 180);
  const targetX = center + Math.cos(angleRad) * radius;
  const targetY = center + Math.sin(angleRad) * radius;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
      {/* Hand Line */}
      <line
        x1={center}
        y1={center}
        x2={targetX}
        y2={targetY}
        stroke="var(--color-primary, #0284c7)"
        strokeWidth="2.5"
      />
      {/* Selected Value Circle Node */}
      <circle
        cx={targetX}
        cy={targetY}
        r="18"
        fill="var(--color-primary, #0284c7)"
      />
    </svg>
  );
}
