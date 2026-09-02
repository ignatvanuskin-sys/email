type ApiError = Error & { status?: number; code?: string; requestId?: string };

const REQUEST_TIMEOUT_MS = 15_000;

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const requestId = createRequestId();
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type") && init?.body) headers.set("content-type", "application/json");
  headers.set("x-request-id", requestId);
  if (init?.signal) {
    if (init.signal.aborted) controller.abort(init.signal.reason);
    else init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: "no-store", signal: controller.signal });
  } catch (error) {
    const err = new Error(error instanceof DOMException && error.name === "AbortError" ? "Request timed out" : "Network request failed") as ApiError;
    err.code = error instanceof DOMException && error.name === "AbortError" ? "REQUEST_TIMEOUT" : "NETWORK_ERROR";
    err.requestId = requestId;
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const payload = data && typeof data === "object" ? data as { error?: unknown; code?: unknown; requestId?: unknown } : {};
    const err = new Error(typeof payload.error === "string" ? payload.error : `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    err.code = typeof payload.code === "string" ? payload.code : "HTTP_ERROR";
    err.requestId = typeof payload.requestId === "string" ? payload.requestId : res.headers.get("x-request-id") ?? requestId;
    throw err;
  }
  return data as T;
}

function createRequestId(): string {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
