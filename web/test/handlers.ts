import { http, HttpResponse } from "msw";

// Default API responses for component tests. A test overrides them with worker.use().
export const handlers = [
  http.get("/api/health", () => HttpResponse.json({ ok: true })),
  // An anonymous visitor: the session endpoint answers 200 with no user.
  http.get("/api/session", () => HttpResponse.json({ user: null })),
  // Every handle the shared rule allows is free.
  http.get("/api/handles/availability", ({ request }) => {
    const handle = new URL(request.url).searchParams.get("handle") ?? "";
    return HttpResponse.json({
      handle,
      availability: "available",
      message: `${handle} is available.`,
    });
  }),
];
