"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

function highlightMatch(label: string, query: string) {
  if (!query.trim()) return label;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <span className="font-semibold text-accent">{label.slice(idx, idx + query.length)}</span>
      {label.slice(idx + query.length)}
    </>
  );
}

interface FloatingPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

let dropdownIdCounter = 0;

export function Dropdown({ label, value, onChange, options, placeholder = "Select…", disabled, error }: DropdownProps) {
  const [listboxId] = useState(() => `dropdown-listbox-${++dropdownIdCounter}`);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => setMounted(true), []);

  // Fully viewport-relative positioning (portal into <body>) so the listbox
  // is never clipped by an ancestor's overflow-hidden (every card/modal in
  // this app uses that), and flips upward when there isn't room below.
  useEffect(() => {
    if (!open) return;

    function reposition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const GAP = 6;
      const MIN_HEIGHT = 120;
      const MAX_HEIGHT = 256;
      const spaceBelow = window.innerHeight - rect.bottom - GAP - 8;
      const spaceAbove = rect.top - GAP - 8;
      const openUp = spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow;

      setPosition({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, openUp ? spaceAbove : spaceBelow)),
        ...(openUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      });
    }

    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));

    // Focus the search input once the field mounts.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      const insideRoot = rootRef.current?.contains(target);
      const insideList = listRef.current?.contains(target);
      if (!insideRoot && !insideList) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function selectOption(opt: DropdownOption) {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[activeIndex]) selectOption(filtered[activeIndex]);
      else setOpen(true);
      return;
    }
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      {label && <span className="text-sm font-medium text-foreground">{label}</span>}

      <div
        className={`flex w-full items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
          error ? "border-danger" : open ? "border-accent" : "border-border"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          value={open ? query : (selected?.label ?? "")}
          placeholder={selected ? selected.label : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onMouseDown={() => {
            // Re-click while already focused/open closes it; the first click
            // (which triggers focus + open) must not be undone by this.
            if (open && document.activeElement === inputRef.current) setOpen(false);
          }}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            setOpen((v) => !v);
            inputRef.current?.focus();
          }}
          className="shrink-0 text-muted-foreground disabled:cursor-not-allowed"
          aria-label="Toggle options"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open &&
        mounted &&
        position &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              top: position.top,
              bottom: position.bottom,
            }}
            className="no-scrollbar z-100 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-(--shadow-overlay)"
          >
            {filtered.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectOption(opt)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isActive ? "bg-secondary text-secondary-foreground" : "text-foreground hover:bg-secondary"
                  }`}
                >
                  <span className="truncate">{highlightMatch(opt.label, query)}</span>
                  {isSelected && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>}
          </div>,
          document.body
        )}

      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
