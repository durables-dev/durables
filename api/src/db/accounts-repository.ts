import type { AccountRecord } from "../model/account.js";
import { getPool } from "./pool.js";

export async function findAccount(handle: string): Promise<AccountRecord | null> {
  const { rows } = await getPool().query<{ handle: string; display_name: string; verified: boolean }>(
    "SELECT handle, display_name, verified FROM accounts WHERE handle = $1",
    [handle],
  );
  const row = rows[0];
  return row ? { handle: row.handle, displayName: row.display_name, verified: row.verified } : null;
}
