import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isAddressSegment, isVersion } from "../domain/addresses/address.js";
import type { ActivityVersion } from "../model/activity-version.js";
import type { GroupVersion } from "../model/group-version.js";
import { VersionExistsError, type DocumentStore } from "./document-store.js";

// Documents on local disk, under DOCUMENTS_DIR:
//
//   activities/<owner>/<name>/<version>.json
//   groups/<owner>/<name>/<version>.json
//
// Owner, name and version are checked before they become path segments, so a
// request path can't reach outside the directory.

type Kind = "activities" | "groups";

// POC-SHORTCUT: SC-007
export function diskDocumentStore(root: string): DocumentStore {
  const dirFor = (kind: Kind, owner: string, name: string) => join(root, kind, owner, name);
  const valid = (owner: string, name: string) => isAddressSegment(owner) && isAddressSegment(name);

  async function put(kind: Kind, doc: { owner: string; name: string; version: string }): Promise<void> {
    if (!valid(doc.owner, doc.name) || !isVersion(doc.version)) {
      throw new Error(`Invalid document key ${doc.owner}/${doc.name}@${doc.version}`);
    }
    const dir = dirFor(kind, doc.owner, doc.name);
    await mkdir(dir, { recursive: true });
    try {
      // "wx" fails if the file exists: a published version is never overwritten.
      await writeFile(join(dir, `${doc.version}.json`), JSON.stringify(doc, null, 2), { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const prefix = kind === "groups" ? `${doc.owner}/groups` : doc.owner;
        throw new VersionExistsError(`${prefix}/${doc.name}@${doc.version} is already published`);
      }
      throw error;
    }
  }

  async function get<T>(kind: Kind, owner: string, name: string, version: string): Promise<T | null> {
    if (!valid(owner, name) || !isVersion(version)) return null;
    try {
      return JSON.parse(await readFile(join(dirFor(kind, owner, name), `${version}.json`), "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async function list(kind: Kind, owner: string, name: string): Promise<string[]> {
    if (!valid(owner, name)) return [];
    try {
      const files = await readdir(dirFor(kind, owner, name));
      return files.filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -".json".length)).filter(isVersion);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  return {
    putActivityVersion: (doc) => put("activities", doc),
    getActivityVersion: (owner, name, version) => get<ActivityVersion>("activities", owner, name, version),
    listActivityVersions: (owner, name) => list("activities", owner, name),
    putGroupVersion: (doc) => put("groups", doc),
    getGroupVersion: (owner, name, version) => get<GroupVersion>("groups", owner, name, version),
    listGroupVersions: (owner, name) => list("groups", owner, name),
  };
}
