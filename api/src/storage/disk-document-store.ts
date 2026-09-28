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

  /** The subdirectories of `dir` that are valid address segments. Empty if `dir` doesn't exist. */
  async function segmentsIn(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory() && isAddressSegment(entry.name)).map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async function listActivities(): Promise<{ owner: string; name: string }[]> {
    const owners = await segmentsIn(join(root, "activities"));
    const perOwner = await Promise.all(
      owners.map(async (owner) => (await segmentsIn(join(root, "activities", owner))).map((name) => ({ owner, name }))),
    );
    return perOwner.flat();
  }

  return {
    putActivityVersion: (doc) => put("activities", doc),
    getActivityVersion: (owner, name, version) => get<ActivityVersion>("activities", owner, name, version),
    listActivityVersions: (owner, name) => list("activities", owner, name),
    listActivities,
    putGroupVersion: (doc) => put("groups", doc),
    getGroupVersion: (owner, name, version) => get<GroupVersion>("groups", owner, name, version),
    listGroupVersions: (owner, name) => list("groups", owner, name),
  };
}
