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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });

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
export async function apiUpload<T>(path: string, file: File, field = "file"): Promise<T> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const form = new FormData();
  form.append(field, file);

  const res = await fetch(`/api${path}`, { method: "POST", headers, body: form });

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
