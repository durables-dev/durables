import { defineConfig } from "drizzle-kit";

// Generates D1 migrations from the Drizzle schema (migrations/README.md).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/storage/schema.ts",
  out: "./migrations",
});
