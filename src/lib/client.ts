// Tiny client-side fetch wrapper for the app's JSON APIs.
type ApiError = Error & { status?: number };

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const apiMessage =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "";
    const err = new Error(apiMessage || `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    throw err;
  }
  return data as T;
}