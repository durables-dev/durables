import { TerraformResource, type ITerraformDependable } from "cdktn";
import { Construct } from "constructs";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { accountId, databaseName } from "./config";

export interface MigrationsProps {
  /** api/migrations/, whose contents trigger a run. */
  readonly migrationsDir: string;
  /** The D1 database's id, known once Terraform has created it. */
  readonly databaseId: string;
  readonly dependsOn: ITerraformDependable[];
}

// Applies D1 migrations in deployment (ADR 0003): Wrangler's migration command, run from the
// deploying machine, before the new Worker version is deployed. Wrangler deploys no code.
// api/wrangler.toml is local-only (its database id is a placeholder), so the step writes a
// migrations-only config with the real id and points Wrangler at it.
export class Migrations extends Construct {
  readonly resource: TerraformResource;

  constructor(scope: Construct, id: string, props: MigrationsProps) {
    super(scope, id);

    const config = [
      "[[d1_databases]]",
      `binding = "DB"`,
      `database_name = "${databaseName}"`,
      `database_id = "$DATABASE_ID"`,
      `migrations_dir = "${props.migrationsDir}"`,
      "",
    ].join("\\n");

    this.resource = new TerraformResource(this, "apply", {
      terraformResourceType: "terraform_data",
      dependsOn: props.dependsOn,
      provisioners: [
        {
          type: "local-exec",
          environment: {
            CLOUDFLARE_ACCOUNT_ID: accountId,
            DATABASE_ID: props.databaseId,
          },
          command:
            `CONFIG=$(mktemp) && printf '${config}' > "$CONFIG" && ` +
            `npx wrangler d1 migrations apply ${databaseName} --remote -c "$CONFIG"`,
        },
      ],
    });
    // terraform_data has no typed binding; triggers_replace re-runs the step whenever a
    // migration file's contents change.
    this.resource.addOverride(
      "triggers_replace",
      migrationsHash(props.migrationsDir),
    );
  }
}

export function migrationsHash(dir: string): string {
  const hash = createHash("sha256");
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    hash.update(file).update(readFileSync(join(dir, file)));
  }
  return hash.digest("hex");
}
