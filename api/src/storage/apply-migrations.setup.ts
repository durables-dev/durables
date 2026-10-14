import type { D1Migration } from "@cloudflare/vitest-plugin";
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    d1Migrations: D1Migration[];
  }
}

// Integration tests run against real local D1 with migrations applied (api/CONVENTIONS.md).
// Already-applied migrations are skipped, so this is safe to run before every test file.
await applyD1Migrations(env.DB, inject("d1Migrations"));
