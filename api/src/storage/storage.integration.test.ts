import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { Storage } from "./storage";

test("reaches the local D1 database", async () => {
  expect(await new Storage(env.DB).isAvailable()).toBe(true);
});
