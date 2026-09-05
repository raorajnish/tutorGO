export interface ApiErrorBody {
  error: { code: string; message: string };
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  /// The full error response body. Some endpoints attach structured detail
  /// alongside the message (e.g. the schedule conflicts a test would cause),
  /// which the caller needs in order to offer a resolution.
  body: unknown;

  constructor(status: number, code: string, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const TOKEN_KEY = "tutorgo_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

/**
 * Silently swaps in a renewed token when `authenticate` (backend
 * middleware/auth.ts) issues one — sliding-expiry sessions, see
 * changes-phase11.md §11.3. Read on every request path (fetch/upload/
 * download) and on both success and error responses, since the token is
 * renewed the moment a request is authenticated, before the route handler
 * itself decides success or failure.
 */
function swapRefreshedToken(res: Response): void {
  const refreshed = res.headers.get("X-Refreshed-Token");
  if (refreshed) setToken(refreshed);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  swapRefreshedToken(res);

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(
      res.status,
      body?.error.code ?? "UNKNOWN_ERROR",
      body?.error.message ?? "Something went wrong",
      body
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Multipart upload — deliberately separate from apiFetch, which always sets
 * a JSON Content-Type. The browser must set the multipart boundary itself, so
 * Content-Type is left unset here on purpose. */
export async function apiUpload<T>(
  path: string,
  file: File,
  field = "file",
  extraFields?: Record<string, string>
): Promise<T> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const form = new FormData();
  form.append(field, file);
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) form.append(key, value);
  }

  const res = await fetch(`/api${path}`, { method: "POST", headers, body: form });
  swapRefreshedToken(res);

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(
      res.status,
      body?.error.code ?? "UNKNOWN_ERROR",
      body?.error.message ?? "Upload failed"
    );
  }

  return res.json() as Promise<T>;
}

/** Downloads a file-returning endpoint (CSV export, etc.) and saves it under
 * `filename`. Checks `res.ok` before touching the body — without that check,
 * a 403/500's error JSON gets blobbed and saved as if it were the real file. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { headers });
  swapRefreshedToken(res);

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(
      res.status,
      body?.error.code ?? "UNKNOWN_ERROR",
      body?.error.message ?? "Download failed"
    );
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
