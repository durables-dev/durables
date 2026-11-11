import { exports } from "cloudflare:workers";
import { expect, test } from "vitest";

test("/api/health answers", async () => {
  const response = await exports.default.fetch("http://localhost/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
