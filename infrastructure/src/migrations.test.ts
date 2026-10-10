import { Testing } from "cdktn";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Migrations, migrationsHash } from "./migrations";

const dir = mkdtempSync(join(tmpdir(), "durables-migrations-"));
writeFileSync(join(dir, "0001_init.sql"), "create table t (id text);");

test("the hash changes when a migration's contents change", () => {
  const before = migrationsHash(dir);
  writeFileSync(
    join(dir, "0001_init.sql"),
    "create table t (id text, name text);",
  );

  expect(migrationsHash(dir)).not.toBe(before);
});

test("runs Wrangler's migration command against a generated config", () => {
  const synthesized = Testing.synthScope((scope) => {
    new Migrations(scope, "migrations", {
      migrationsDir: dir,
      databaseId: "db-id",
      dependsOn: [],
    });
  });
  const stack = JSON.parse(synthesized) as {
    resource: {
      terraform_data: Record<
        string,
        {
          provisioner: { "local-exec": { command: string } }[];
          triggers_replace: string;
        }
      >;
    };
  };
  const [step] = Object.values(stack.resource.terraform_data);
  if (!step) throw new Error("no migration step synthesized");

  expect(step.provisioner[0]?.["local-exec"].command).toContain(
    "wrangler d1 migrations apply durables --remote",
  );
  expect(step.triggers_replace).toBe(migrationsHash(dir));
});
