// Publishes the seeded activities through the same paste flow a publisher uses:
// detect, check, then publish, as the publisher user, against a running api.
//
//   npm run publish-seeds            (from testing/seed, after compose up)
//
// It publishes demo/refund-charge/ first, then every folder in catalog/<sdk>/<name>/.
// refund-charge goes first because catalog seeds name it as their compensation,
// and publishing rejects a compensation address that isn't published yet.
// catalog/ may be empty or missing. demo/charge-card/ is never published: it is
// pasted by hand in the demo. An activity that is already published is skipped,
// so the script can be run again.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.DURABLES_API_URL ?? "http://localhost:3000";
const PUBLISHER = "kisasa";
const SEED_FILES = new Set(["declaration.json", "README.md", "example-input.json"]);
const here = fileURLToPath(new URL(".", import.meta.url));

function catalogFolders(): string[] {
  const catalog = join(here, "catalog");
  if (!existsSync(catalog)) return [];
  return readdirSync(catalog, { withFileTypes: true })
    .filter((sdk) => sdk.isDirectory())
    .flatMap((sdk) =>
      readdirSync(join(catalog, sdk.name), { withFileTypes: true })
        .filter((activity) => activity.isDirectory())
        .map((activity) => join(catalog, sdk.name, activity.name)),
    );
}

async function call(method: string, path: string, body: unknown): Promise<{ status: number; payload: any }> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Durables-User": PUBLISHER },
    body: JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json().catch(() => null) };
}

async function publish(folder: string): Promise<void> {
  const files = readdirSync(folder);
  const activityFile = files.find((file) => !SEED_FILES.has(file));
  if (!activityFile) throw new Error(`${folder} has no activity file`);
  const read = (file: string) => readFileSync(join(folder, file), "utf8");

  const code = read(activityFile);
  const declarations = JSON.parse(read("declaration.json"));
  const readme = read("README.md");
  const exampleInput = JSON.parse(read("example-input.json"));

  const detect = await call("POST", "/activities/detect", { code });
  if (detect.status !== 200) throw new Error(`detect ${activityFile}: ${detect.status} ${JSON.stringify(detect.payload)}`);
  const check = await call("POST", "/activities/check", { code, declarations });
  if (check.status !== 200) throw new Error(`check ${activityFile}: ${check.status} ${JSON.stringify(check.payload)}`);

  const published = await call("POST", "/activities", { code, declarations, readme, exampleInput });
  if (published.status === 201) {
    console.log(`Published ${published.payload.address}`);
  } else if (published.status === 409) {
    console.log(`Skipped ${activityFile}: ${published.payload?.error}`);
  } else {
    throw new Error(`publish ${activityFile}: ${published.status} ${JSON.stringify(published.payload)}`);
  }
}

const folders = [join(here, "demo", "refund-charge"), ...catalogFolders()];
for (const folder of folders) {
  await publish(folder);
}
console.log(`Done: ${folders.length} seed folder(s) against ${API}.`);
