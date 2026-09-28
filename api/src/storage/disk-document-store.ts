import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isAddressSegment, isVersion } from "../domain/addresses/address.js";
import type { ActivityVersion } from "../model/activity-version.js";
import { VersionExistsError, type DocumentStore } from "./document-store.js";

// Documents on local disk, under DOCUMENTS_DIR:
//
//   activities/<owner>/<name>/<version>.json
//
// Owner, name and version are checked before they become path segments, so a
// request path can't reach outside the directory.

// POC-SHORTCUT: SC-007
export function diskDocumentStore(root: string): DocumentStore {
  const activityDir = (owner: string, name: string) => join(root, "activities", owner, name);
  const valid = (owner: string, name: string) => isAddressSegment(owner) && isAddressSegment(name);

  return {
    async putActivityVersion(doc) {
      if (!valid(doc.owner, doc.name) || !isVersion(doc.version)) {
        throw new Error(`Invalid document key ${doc.owner}/${doc.name}@${doc.version}`);
      }
      const dir = activityDir(doc.owner, doc.name);
      await mkdir(dir, { recursive: true });
      try {
        // "wx" fails if the file exists: a published version is never overwritten.
        await writeFile(join(dir, `${doc.version}.json`), JSON.stringify(doc, null, 2), { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new VersionExistsError(`${doc.owner}/${doc.name}@${doc.version} is already published`);
        }
        throw error;
      }
    },

    async getActivityVersion(owner, name, version) {
      if (!valid(owner, name) || !isVersion(version)) return null;
      try {
        return JSON.parse(await readFile(join(activityDir(owner, name), `${version}.json`), "utf8")) as ActivityVersion;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async listActivityVersions(owner, name) {
      if (!valid(owner, name)) return [];
      try {
        const files = await readdir(activityDir(owner, name));
        return files.filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -".json".length)).filter(isVersion);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    },
  };
}
