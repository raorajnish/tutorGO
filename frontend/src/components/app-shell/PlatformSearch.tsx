"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface SearchResults {
  students: { id: string; name: string; email: string; phone: string | null; studentCode: string; instituteId: string; instituteName: string; organizationId: string; organizationName: string }[];
  users: { id: string; fullName: string; email: string; role: string; instituteId: string | null; instituteName: string | null; organizationId: string | null; organizationName: string | null }[];
  institutes: { id: string; name: string; code: string; organizationId: string; organizationName: string }[];
  organizations: { id: string; name: string; code: string }[];
}

const EMPTY: SearchResults = { students: [], users: [], institutes: [], organizations: [] };

/** SuperAdmin-only global search (changes-phase12.md §12.9) — "which
 * institute is this phone number in" without guessing which organization to
 * open first. Replaces the header's otherwise-inert search box for this one
 * role; other roles keep the plain placeholder input as-is. */
export function PlatformSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    const t = setTimeout(() => {
      apiFetch<SearchResults>(`/platform/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => setResults(EMPTY));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  const hasResults =
    results.students.length > 0 || results.users.length > 0 || results.institutes.length > 0 || results.organizations.length > 0;

  return (
    <div ref={containerRef} className="relative hidden min-w-0 flex-1 sm:block">
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
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        placeholder="Find a student, staff member, institute, or organization…"
        className="w-full max-w-md rounded-full border-none bg-muted py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 top-full z-30 mt-2 max-h-96 w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-(--shadow-overlay)">
          {!hasResults && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</p>}

          {results.organizations.length > 0 && (
            <ResultGroup title="Organizations">
              {results.organizations.map((o) => (
                <ResultRow key={o.id} label={o.name} sub={o.code} onClick={() => go(`/platform/organizations/${o.id}`)} />
              ))}
            </ResultGroup>
          )}

          {results.institutes.length > 0 && (
            <ResultGroup title="Institutes">
              {results.institutes.map((i) => (
                <ResultRow
                  key={i.id}
                  label={i.name}
                  sub={`${i.code} · ${i.organizationName}`}
                  onClick={() => go(`/platform/organizations/${i.organizationId}/institutes/${i.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {results.users.length > 0 && (
            <ResultGroup title="Staff">
              {results.users.map((u) => (
                <ResultRow
                  key={u.id}
                  label={u.fullName}
                  sub={`${u.email} · ${u.instituteName ?? u.organizationName ?? "—"}`}
                  onClick={() =>
                    u.instituteId && u.organizationId
                      ? go(`/platform/organizations/${u.organizationId}/institutes/${u.instituteId}`)
                      : u.organizationId
                        ? go(`/platform/organizations/${u.organizationId}`)
                        : undefined
                  }
                />
              ))}
            </ResultGroup>
          )}

          {results.students.length > 0 && (
            <ResultGroup title="Students">
              {results.students.map((s) => (
                <ResultRow
                  key={s.id}
                  label={s.name}
                  sub={`${s.studentCode} · ${s.instituteName}`}
                  onClick={() => go(`/platform/organizations/${s.organizationId}/institutes/${s.instituteId}`)}
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

function ResultRow({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full px-4 py-2 text-left text-sm hover:bg-secondary">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </button>
  );
}
