// The shared fetch wrapper. Every call goes to a relative /api/... path, which
// the Vite dev server proxies to api with the /api prefix stripped.

let userHandle: string | null = null;

/** Set by CurrentUserProvider. Sent as X-Durables-User on every call. */
export function setUserHandle(handle: string | null): void {
  userHandle = handle;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (userHandle) headers["X-Durables-User"] = userHandle;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, payload?.message ?? payload?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}
