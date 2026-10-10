import { http, HttpResponse } from "msw";

// Default API responses for component tests. A test overrides them with worker.use().
export const handlers = [
  http.get("/api/health", () => HttpResponse.json({ ok: true })),
];
