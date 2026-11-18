import { z } from "zod";

/** The router state Restore navigates to the profile with, so the frame says it is restored. */
export interface AccountRestoredState {
  accountRestored: true;
}

/** The state for the navigation that follows a finished Restore. */
export const accountRestoredState: AccountRestoredState = {
  accountRestored: true,
};

const restoredStateSchema = z.object({ accountRestored: z.literal(true) });

/** Whether the router state says the account was just restored. */
export function isAccountRestoredState(state: unknown): boolean {
  return restoredStateSchema.safeParse(state).success;
}
