import { Construct } from "constructs";
import { D1Database } from "../.gen/providers/cloudflare/d1-database";
import { R2Bucket } from "../.gen/providers/cloudflare/r2-bucket";
import { databaseName, documentsBucketName } from "./config";

export interface StorageProps {
  /** The Cloudflare account, supplied at deploy. */
  readonly accountId: string;
}

// The two data stores (ADR 0005). Replacing the database deletes its data, so nothing here
// changes without a migration plan.
export class Storage extends Construct {
  readonly database: D1Database;
  readonly documents: R2Bucket;

  constructor(scope: Construct, id: string, { accountId }: StorageProps) {
    super(scope, id);

    this.database = new D1Database(this, "database", {
      accountId,
      name: databaseName,
      primaryLocationHint: "wnam",
      // Cloudflare reports this once the database exists; left unset, the provider tries to clear
      // it on the next apply and the API rejects the null.
      readReplication: { mode: "disabled" },
    });

    this.documents = new R2Bucket(this, "documents", {
      accountId,
      name: documentsBucketName,
      location: "wnam",
    });
  }
}
