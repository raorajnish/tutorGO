import type { Course, CourseRef } from "./types";

/** Course dropdowns for "create new" actions fetch only active courses
 * (`?active=true`) — but an *editing* flow may point at a course that's
 * since been deactivated, and silently dropping it from the option list
 * would blank out a valid selection. Call this to guarantee the currently
 * selected course stays present (labeled "inactive"), without re-surfacing
 * any OTHER inactive course as newly selectable. See changes-phase8.md §8b.
 */
export function courseOptions(courses: Course[], current?: CourseRef | null): { value: string; label: string }[] {
  const options = courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  if (current && !courses.some((c) => c.id === current.id)) {
    options.push({ value: current.id, label: `${current.name} (${current.code}) — inactive` });
  }
  return options;
}
