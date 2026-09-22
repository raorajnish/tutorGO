"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface DatePickerProps {
  value?: string; // YYYY-MM-DD format
  onChange?: (value: any) => void;
  label?: ReactNode;
  error?: string;
  required?: boolean;
  requiredStar?: boolean;
  disabled?: boolean;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  placeholder?: string;
  className?: string;
  id?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_HEADER_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Utility to format date string YYYY-MM-DD to Date object in local time zone safely */
function parseIsoDate(iso?: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getHeaderFormattedDate(isoDate: string): string {
  const dateObj = parseIsoDate(isoDate);
  if (!dateObj) return "Select Date";
  const dayName = WEEKDAY_HEADER_FULL[dateObj.getDay()];
  const monthName = MONTH_NAMES[dateObj.getMonth()].slice(0, 3);
  const dayNum = dateObj.getDate();
  return `${dayName}, ${monthName} ${dayNum}`;
}

/** Generates year list from 1950 to 2050 (or bound by min/max) */
function getYearsList(minIso?: string, maxIso?: string): number[] {
  const currentYear = new Date().getFullYear();
  let startYear = currentYear - 75;
  let endYear = currentYear + 25;

  if (minIso && /^\d{4}/.test(minIso)) {
    const minY = parseInt(minIso.slice(0, 4), 10);
    if (!isNaN(minY)) startYear = Math.min(startYear, minY);
  }
  if (maxIso && /^\d{4}/.test(maxIso)) {
    const maxY = parseInt(maxIso.slice(0, 4), 10);
    if (!isNaN(maxY)) endYear = Math.max(endYear, maxY);
  }

  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }
  return years;
}

export function DatePicker({
  value = "",
  onChange,
  label,
  error,
  required,
  requiredStar,
  disabled,
  min,
  max,
  placeholder = "Select date",
  className = "",
  id,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  // Calendar view state (year and month currently displayed)
  const initialDate = parseIsoDate(value) || new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Sync state when props value or modal opens
  useEffect(() => {
    setTempValue(value);
    const parsed = parseIsoDate(value) || new Date();
    setViewYear(parsed.getFullYear());
    setViewMonth(parsed.getMonth());
  }, [value, isOpen]);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleConfirm = () => {
    if (onChange && tempValue) {
      const fakeEvent = {
        target: { value: tempValue, name: id || "" },
        currentTarget: { value: tempValue, name: id || "" },
      };
      (onChange as any)(tempValue, fakeEvent);
    }
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build calendar matrix (42 cells: 6 rows of 7 days)
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const calendarDays = [];

  // 1. Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const prevDay = daysInPrevMonth - i;
    const prevDate = new Date(viewYear, viewMonth - 1, prevDay);
    const iso = formatIsoDate(prevDate);
    calendarDays.push({
      day: prevDay,
      iso,
      isCurrentMonth: false,
      isDisabled: isDateDisabled(iso, min, max),
    });
  }

  // 2. Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const currDate = new Date(viewYear, viewMonth, d);
    const iso = formatIsoDate(currDate);
    calendarDays.push({
      day: d,
      iso,
      isCurrentMonth: true,
      isDisabled: isDateDisabled(iso, min, max),
    });
  }

  // 3. Next month leading days to complete 35 or 42 grid cells
  const remainingCells = (calendarDays.length > 35 ? 42 : 35) - calendarDays.length;
  for (let d = 1; d <= remainingCells; d++) {
    const nextDate = new Date(viewYear, viewMonth + 1, d);
    const iso = formatIsoDate(nextDate);
    calendarDays.push({
      day: d,
      iso,
      isCurrentMonth: false,
      isDisabled: isDateDisabled(iso, min, max),
    });
  }

  const showStar = requiredStar ?? required;
  const displayFormattedText = value ? getHeaderFormattedDate(value) : "";

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
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {error && <span className="text-xs text-danger">{error}</span>}

      {/* Responsive Modal Picker */}
      {isOpen && (
        <DatePickerModal
          isOpen={isOpen}
          tempValue={tempValue}
          setTempValue={setTempValue}
          viewYear={viewYear}
          setViewYear={setViewYear}
          viewMonth={viewMonth}
          setViewMonth={setViewMonth}
          min={min}
          max={max}
          calendarDays={calendarDays}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onClose={handleClose}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

function isDateDisabled(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return true;
  if (max && iso > max) return true;
  return false;
}

interface DatePickerModalProps {
  isOpen: boolean;
  tempValue: string;
  setTempValue: (val: string) => void;
  viewYear: number;
  setViewYear: (y: number) => void;
  viewMonth: number;
  setViewMonth: (m: number) => void;
  min?: string;
  max?: string;
  calendarDays: Array<{ day: number; iso: string; isCurrentMonth: boolean; isDisabled: boolean }>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

function DatePickerModal({
  isOpen,
  tempValue,
  setTempValue,
  viewYear,
  setViewYear,
  viewMonth,
  setViewMonth,
  min,
  max,
  calendarDays,
  onPrevMonth,
  onNextMonth,
  onClose,
  onConfirm,
}: DatePickerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [pickerStep, setPickerStep] = useState<"days" | "year" | "month">("days");
  const activeYearRef = useRef<HTMLButtonElement>(null);

  const yearsList = getYearsList(min, max);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Auto-scroll selected year into view when year picker opens
  useEffect(() => {
    if (pickerStep === "year" && activeYearRef.current) {
      activeYearRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [pickerStep]);

  if (!mounted) return null;

  const headerDateText = tempValue ? getHeaderFormattedDate(tempValue) : getHeaderFormattedDate(formatIsoDate(new Date()));

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-fadeIn"
      onClick={onClose}
    >
      {/* Modal Dialog Card */}
      <div
        className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Block */}
        <div className="bg-primary px-6 py-5 border-b border-border/20 text-primary-foreground">
          <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/80">SELECT DATE</p>
          <h2 className="mt-1 text-3xl font-extrabold text-primary-foreground tracking-tight">
            {headerDateText}
          </h2>
        </div>

        {/* Body Container */}
        <div className="p-5 min-h-[290px]">
          {pickerStep === "days" && (
            <div className="animate-fadeIn">
              {/* Month & Year Header */}
              <div className="flex items-center justify-between mb-4 px-1">
                <button
                  type="button"
                  onClick={() => setPickerStep("year")}
                  className="flex items-center gap-1.5 font-bold text-foreground hover:text-primary transition-colors cursor-pointer rounded-xl px-2 py-1 hover:bg-muted"
                >
                  <span className="text-base">{MONTH_NAMES[viewMonth]} {viewYear}</span>
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onPrevMonth}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors cursor-pointer"
                    aria-label="Previous month"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={onNextMonth}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors cursor-pointer"
                    aria-label="Next month"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Weekday Labels Header Grid */}
              <div className="grid grid-cols-7 text-center mb-2">
                {WEEKDAY_NAMES.map((name, i) => (
                  <span key={i} className="text-xs font-bold text-muted-foreground py-1">
                    {name}
                  </span>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {calendarDays.map((item, idx) => {
                  const isSelected = tempValue === item.iso;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={item.isDisabled}
                      onClick={() => !item.isDisabled && setTempValue(item.iso)}
                      className={`relative flex h-9 w-9 items-center justify-center justify-self-center rounded-full text-sm font-medium transition-all ${
                        isSelected
                          ? "border-2 border-primary text-primary font-bold shadow-xs bg-primary/10 dark:bg-primary/20"
                          : item.isCurrentMonth
                          ? "text-foreground hover:bg-primary/10 hover:text-primary cursor-pointer"
                          : "text-muted-foreground/40 cursor-pointer"
                      } ${item.isDisabled ? "opacity-30 cursor-not-allowed hover:bg-transparent hover:text-inherit" : ""}`}
                    >
                      {item.day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 1: SELECT YEAR VIEW */}
          {pickerStep === "year" && (
            <div className="animate-fadeIn">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SELECT YEAR</span>
                <button
                  type="button"
                  onClick={() => setPickerStep("days")}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {/* Year Selection Grid */}
              <div className="max-h-56 overflow-y-auto grid grid-cols-4 gap-2 pr-1 no-scrollbar border border-border/50 rounded-xl p-2 bg-muted/20">
                {yearsList.map((y) => {
                  const isCurrent = viewYear === y;
                  return (
                    <button
                      key={y}
                      ref={isCurrent ? activeYearRef : null}
                      type="button"
                      onClick={() => {
                        setViewYear(y);
                        // Transition to Step 2: Select Month
                        setPickerStep("month");
                      }}
                      className={`py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                        isCurrent
                          ? "bg-primary text-primary-foreground shadow-sm scale-105"
                          : "text-foreground hover:bg-muted hover:text-primary"
                      }`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: SELECT MONTH VIEW */}
          {pickerStep === "month" && (
            <div className="animate-fadeIn">
              <div className="flex items-center justify-between mb-3 px-1">
                <button
                  type="button"
                  onClick={() => setPickerStep("year")}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>{viewYear}</span>
                </button>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SELECT MONTH</span>
              </div>

              {/* Month Selection Grid */}
              <div className="grid grid-cols-3 gap-2 py-2">
                {MONTH_NAMES.map((mName, mIdx) => (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => {
                      setViewMonth(mIdx);
                      // Transition back to Days Grid
                      setPickerStep("days");
                    }}
                    className={`py-3 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                      viewMonth === mIdx
                        ? "bg-primary text-primary-foreground shadow-sm scale-105"
                        : "bg-muted/50 text-foreground hover:bg-muted hover:text-primary"
                    }`}
                  >
                    {mName.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/40 bg-card">
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
    </div>,
    document.body
  );
}
