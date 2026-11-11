import { Testing } from "cdktn";
import { D1Database } from "../.gen/providers/cloudflare/d1-database";
import { R2Bucket } from "../.gen/providers/cloudflare/r2-bucket";
import { databaseName, documentsBucketName } from "./config";
import { Storage } from "./storage";

test("creates the database and the documents bucket", () => {
  const synthesized = Testing.synthScope((scope) => {
    new Storage(scope, "storage", { accountId: "account-id" });
  });

  expect(synthesized).toHaveResourceWithProperties(D1Database, {
    name: databaseName,
  });
  expect(synthesized).toHaveResourceWithProperties(R2Bucket, {
    name: documentsBucketName,
  });
});
