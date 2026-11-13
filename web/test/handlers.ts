import { http, HttpResponse } from "msw";
import { testCatalog } from "./sdk-catalog";

// Default API responses for component tests. A test overrides them with worker.use().
export const handlers = [
  http.get("/api/health", () => HttpResponse.json({ ok: true })),
  // The SDK catalog: the three SDKs the api accepted before the catalog.
  http.get("/api/sdks", () => HttpResponse.json(testCatalog)),
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
  // The detection check refuses whatever it is sent, so no test is accepted by accident.
  http.post("/api/checks", () =>
    HttpResponse.json(
      {
        type: "https://durables.dev/problems/not-a-temporal-activity",
        title: "Not a Temporal activity",
        status: 422,
      },
      { status: 422, headers: { "Content-Type": "application/problem+json" } },
    ),
  ),
];
