import { fileURLToPath } from "node:url";
import { readWranglerConfig } from "./wrangler-config";

const wranglerToml = fileURLToPath(
  new URL("../../api/wrangler.toml", import.meta.url),
);

test("reads the values the Worker must share with api", () => {
  const config = readWranglerConfig(wranglerToml);

  expect(config.compatibilityDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(config.d1Binding).toBe("DB");
  expect(config.r2Binding).toBe("DOCUMENTS");
  expect(config.assetsBinding).toBe("ASSETS");
  expect(config.rateLimits).toEqual([
    { name: "PUBLISH_LIMIT", namespaceId: "1001", limit: 10, period: 60 },
    { name: "PREVIEW_LIMIT", namespaceId: "1002", limit: 60, period: 60 },
  ]);
  expect(config.crons).toEqual(["0 3 * * *"]);
});
