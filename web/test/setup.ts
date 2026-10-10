import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll } from "vitest";
import { handlers } from "./handlers";

// Component tests fake only the API (web/CONVENTIONS.md). An unhandled request to /api is an
// error, so a test never reaches a real Worker by accident.
export const worker = setupWorker(...handlers);

beforeAll(async () => {
  await worker.start({ onUnhandledFrame: "error", quiet: true });
});
afterEach(() => {
  worker.resetHandlers();
});
afterAll(async () => {
  await worker.stop();
});
