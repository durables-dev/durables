export type Account = {
  handle: string;
  displayName: string;
};

/** A row of the `accounts` table. `verified` backs the Verified Publisher badge. */
export type AccountRecord = Account & {
  verified: boolean;
};
