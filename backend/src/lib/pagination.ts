/** Default page size for a new offset-paginated list endpoint — 20 rows
 * balances fewer page flips against not overwhelming a compact table.
 * Override it for a genuinely dense, scan-and-filter tool (the audit log
 * uses 50 — see AUDIT_LOG_PAGE_SIZE in routes/platform.ts — since staff there
 * mostly filter rather than page through). Pair with the frontend's shared
 * `Pagination` component (components/ui/Pagination.tsx), which takes
 * pageSize as a prop rather than assuming one. */
export const DEFAULT_PAGE_SIZE = 20;
