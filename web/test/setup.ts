import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { worker } from "./worker";

// Requests the page has sent that MSW has not picked up yet, by URL. MSW's service worker can
// hand a request to the page after the test that sent it has ended; if the handlers were reset
// by then, the next test's handlers would answer it. So each test waits for its own requests.
const unseen = new Map<string, number>();
const pageFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const { url } = new Request(input, init);
  unseen.set(url, (unseen.get(url) ?? 0) + 1);
  return pageFetch(input, init);
};
worker.events.on("request:start", ({ request }) => {
  const left = (unseen.get(request.url) ?? 0) - 1;
  if (left > 0) {
    unseen.set(request.url, left);
  } else {
    unseen.delete(request.url);
  }
});

// Component tests fake only the API (web/CONVENTIONS.md). An unhandled request to /api is an
// error, so a test never reaches a real Worker by accident.
beforeAll(async () => {
  await worker.start({ onUnhandledFrame: "error", quiet: true });
});
afterEach(async () => {
  await vi.waitUntil(() => unseen.size === 0, { timeout: 2000 });
  worker.resetHandlers();
});
afterAll(async () => {
  await worker.stop();
});
