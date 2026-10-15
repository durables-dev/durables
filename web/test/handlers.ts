import { http, HttpResponse } from "msw";

// Default API responses for component tests. A test overrides them with worker.use().
export const handlers = [
  http.get("/api/health", () => HttpResponse.json({ ok: true })),
  // An anonymous visitor: the session endpoint answers 200 with no user.
  http.get("/api/session", () => HttpResponse.json({ user: null })),
];
