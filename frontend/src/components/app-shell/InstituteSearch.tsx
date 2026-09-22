"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface StudentResult {
  id: string;
  name: string;
  studentCode: string;
  phone: string | null;
}

interface StaffResult {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface EnquiryResult {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface BatchResult {
  id: string;
  name: string;
  course: {
    code: string;
    name: string;
  };
}

interface SearchResults {
  students: StudentResult[];
  staff: StaffResult[];
  enquiries: EnquiryResult[];
  batches: BatchResult[];
}

const EMPTY_RESULTS: SearchResults = {
  students: [],
  staff: [],
  enquiries: [],
  batches: [],
};

export function InstituteSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [placeholder, setPlaceholder] = useState("Search…");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dynamic responsive placeholder
  useEffect(() => {
    const updatePlaceholder = () => {
      if (window.innerWidth >= 640) {
        setPlaceholder("Search students, staff, enquiries, batches… (Ctrl+K)");
      } else {
        setPlaceholder("Search…");
      }
    };
    updatePlaceholder();
    window.addEventListener("resize", updatePlaceholder);
    return () => window.removeEventListener("resize", updatePlaceholder);
  }, []);

  // Global Ctrl+K / Cmd+K listener to focus search input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced API fetch (250ms)
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      apiFetch<SearchResults>(`/tenant-search?q=${encodeURIComponent(q.trim())}`)
        .then((res) => {
          setResults(res);
          setOpen(true);
        })
        .catch(() => setResults(EMPTY_RESULTS))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [q]);

  // Dismiss dropdown on click outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSelect(path: string) {
    setOpen(false);
    setQ("");
    router.push(path);
  }

  const hasResults =
    results.students.length > 0 ||
    results.staff.length > 0 ||
    results.enquiries.length > 0 ||
    results.batches.length > 0;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <div className="relative w-full max-w-md">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>

        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-full border-none bg-muted py-2 pl-9 pr-3 sm:pl-10 sm:pr-14 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <kbd className="hidden items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 top-full z-30 mt-2 max-h-96 w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-(--shadow-overlay)">
          {!loading && !hasResults && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matching records found for &ldquo;{q.trim()}&rdquo;.
            </p>
          )}

          {results.students.length > 0 && (
            <ResultGroup title="Students">
              {results.students.map((s) => (
                <ResultRow
                  key={s.id}
                  label={s.name}
                  sub={`${s.studentCode}${s.phone ? ` · 📞 ${s.phone}` : ""}`}
                  badge="Student"
                  onClick={() => handleSelect(`/students`)}
                />
              ))}
            </ResultGroup>
          )}

          {results.staff.length > 0 && (
            <ResultGroup title="Staff & Team">
              {results.staff.map((u) => (
                <ResultRow
                  key={u.id}
                  label={u.fullName}
                  sub={`${u.email} · Role: ${u.role.toLowerCase()}`}
                  badge={u.role}
                  onClick={() => handleSelect(`/settings`)}
                />
              ))}
            </ResultGroup>
          )}

          {results.enquiries.length > 0 && (
            <ResultGroup title="Enquiries & Leads">
              {results.enquiries.map((e) => (
                <ResultRow
                  key={e.id}
                  label={e.name}
                  sub={`📞 ${e.phone} · Status: ${e.status.toLowerCase()}`}
                  badge="Lead"
                  onClick={() => handleSelect(`/enquiries`)}
                />
              ))}
            </ResultGroup>
          )}

          {results.batches.length > 0 && (
            <ResultGroup title="Batches & Courses">
              {results.batches.map((b) => (
                <ResultRow
                  key={b.id}
                  label={b.name}
                  sub={`Course: ${b.course.name} (${b.course.code})`}
                  badge="Batch"
                  onClick={() => handleSelect(`/academics`)}
                />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-1.5 last:border-0">
      <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function ResultRow({
  label,
  sub,
  badge,
  onClick,
}: {
  label: string;
  sub: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-secondary"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </div>
      {badge && (
        <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
          {badge}
        </span>
      )}
    </button>
  );
}
