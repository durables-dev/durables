import { getPool } from "./pool.js";

export type OwnedKind = "activity" | "group";

/** Records that `ownerHandle` owns the named activity or group. A second call for the same name is a no-op. */
export async function insertOwnership(ownerHandle: string, kind: OwnedKind, name: string): Promise<void> {
  await getPool().query(
    "INSERT INTO ownership (owner_handle, kind, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [ownerHandle, kind, name],
  );
}
