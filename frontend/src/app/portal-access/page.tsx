"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { CourseSection } from "@/components/portal-access/CourseSection";
import { EditEmailModal } from "@/components/portal-access/EditEmailModal";
import type { PortalAccessCourse, PortalAccessStudent } from "@/lib/types";

export default function PortalAccessPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<PortalAccessCourse[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PortalAccessStudent | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCourses(await apiFetch<PortalAccessCourse[]>("/portal-access"));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load portal access.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const all = courses ?? [];
    const enabled = all.filter((c) => c.portalEnabled);
    return {
      coursesEnabled: enabled.length,
      totalCourses: all.length,
      active: enabled.reduce((n, c) => n + c.counts.active, 0),
      pending: enabled.reduce((n, c) => n + c.counts.pending, 0),
    };
  }, [courses]);

  // Filtering by course name/code only — searching *within* a course is done
  // inside its own expanded section, so a name typed here doesn't silently
  // hide the course a student belongs to.
  const term = search.trim().toLowerCase();
  const visible = (courses ?? []).filter(
    (c) => !term || c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term)
  );

  if (user && user.role !== "OWNER" && user.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Portal access is managed by owners and admins.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organization</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Portal access</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Turn the student portal on course by course, then send each student their login. Nobody gets an account
          automatically — including new admissions.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Courses with portal on"
          value={courses ? `${stats.coursesEnabled}/${stats.totalCourses}` : "—"}
          tone="primary"
        />
        <StatCard label="Active logins" value={courses ? stats.active : "—"} tone="success" />
        <StatCard label="Awaiting credentials" value={courses ? stats.pending : "—"} tone="warning" />
        <StatCard label="Courses" value={courses ? stats.totalCourses : "—"} tone="accent" />
      </div>

      <Input
        placeholder="Find a course…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {courses === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {courses.length === 0 ? "No courses yet" : "No courses match that search"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {courses.length === 0
              ? "Create a course under Academics first — portal access is granted per course."
              : "Try a different name or code."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((course) => (
            <CourseSection key={course.id} course={course} onChanged={load} onEditEmail={setEditing} />
          ))}
        </div>
      )}

      <EditEmailModal student={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}
