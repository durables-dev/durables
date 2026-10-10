import { Hono } from "hono";

// Production entry point. Routes are chained so their types reach web through AppType.
const app = new Hono<{ Bindings: CloudflareBindings }>().get(
  "/api/health",
  (c) => c.json({ ok: true }),
);

export type AppType = typeof app;

export default app;
