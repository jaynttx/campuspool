/** Where the API lives. Set NEXT_PUBLIC_API_URL for a deployed site; in development it follows the host you opened the page on. */
export function getApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}:8000`;
  return "http://localhost:8000";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; raw?: Blob | Uint8Array<ArrayBuffer>; contentType?: string; headers?: Record<string, string>; signal?: AbortSignal };

function messageFrom(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : "";
    return field ? `Check "${field}": ${first.msg ?? "invalid value"}` : (first.msg ?? "Check your input.");
  }
  return status >= 500 ? "Something went wrong on our side. Try again." : "The request could not be completed.";
}

/** JSON request to the API with the session cookie attached. Throws ApiError with a readable message. */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.raw) {
    headers["Content-Type"] = opts.contentType ?? (opts.raw instanceof Blob ? opts.raw.type : "") ?? "application/octet-stream";
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/octet-stream";
    body = opts.raw as BodyInit;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}${path}`, { method: opts.method ?? "GET", headers, body, credentials: "include", cache: "no-store", signal: opts.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "Cannot reach the CampusPool server. Check that the backend is running.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, messageFrom((data as { detail?: unknown } | null)?.detail, res.status));
  return data as T;
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : "Something went wrong.");

export type HealthResponse = { status: string; service: string };

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${getApiUrl()}/health`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
  return (await res.json()) as HealthResponse;
}

export const absoluteUrl = (path: string | null | undefined): string | null => (path ? `${getApiUrl()}${path}` : null);

/** Downloads a file (for example an encrypted chat photo) with the session cookie attached. */
export async function apiBytes(path: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}${path}`, { credentials: "include", cache: "no-store", signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "Cannot reach the CampusPool server. Check that the backend is running.");
  }
  if (!res.ok) throw new ApiError(res.status, "Could not load the photo.");
  return new Uint8Array(await res.arrayBuffer());
}
