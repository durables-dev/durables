import type { ActivityVersion } from "../model/activity-version.js";
import type { GroupVersion } from "../model/group-version.js";

/** Thrown by putActivityVersion and putGroupVersion when the version already exists. Versions are immutable. */
export class VersionExistsError extends Error {}

/**
 * All document access goes through here. The real store would be S3, DynamoDB
 * or Cassandra. There is no update or delete for a version.
 */
export interface DocumentStore {
  /** Writes a new version document. Throws VersionExistsError if that version exists. */
  putActivityVersion(doc: ActivityVersion): Promise<void>;
  getActivityVersion(owner: string, name: string, version: string): Promise<ActivityVersion | null>;
  /** Every stored version of the activity, in no particular order. Empty if none. */
  listActivityVersions(owner: string, name: string): Promise<string[]>;
  /** Every stored activity's owner and name, in no particular order. Empty if there are none. */
  listActivities(): Promise<{ owner: string; name: string }[]>;

  /** Writes a new group version document. Throws VersionExistsError if that version exists. */
  putGroupVersion(doc: GroupVersion): Promise<void>;
  getGroupVersion(owner: string, name: string, version: string): Promise<GroupVersion | null>;
  /** Every stored version of the group, in no particular order. Empty if none. */
  listGroupVersions(owner: string, name: string): Promise<string[]>;
}
