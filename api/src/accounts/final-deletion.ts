import { createStorage } from "../storage/storage-middleware";
import type { Storage } from "../storage/storage";
import { latestDueDeletionRequest } from "./deletion";

// The daily final-deletion job (ADR 0015). A Cron Trigger runs it once a day. It makes final
// every deletion asked for 30 days or more before the run, through the same final-deletion step
// as Start as a new user. Nothing published is deleted, and a retired handle is never freed.

/** What one run did. */
export interface FinalDeletionRun {
  /** The accounts whose deletion this run made final. */
  finalized: string[];
  /** The accounts that were due but could not be finalized. The next run tries them again. */
  failed: string[];
}

/**
 * Finalizes every account whose deletion is due at this time. A failure on one account is
 * logged and does not stop the others. An account already final is not listed, so a second
 * run finalizes nothing twice.
 */
export const finalizeDueDeletions = async (
  storage: Pick<
    Storage,
    "listAccountsDueForFinalDeletion" | "finalizeAccountDeletion"
  >,
  now: Date,
): Promise<FinalDeletionRun> => {
  const due = await storage.listAccountsDueForFinalDeletion(
    latestDueDeletionRequest(now),
  );
  const run: FinalDeletionRun = { finalized: [], failed: [] };
  for (const accountId of due) {
    try {
      if (await storage.finalizeAccountDeletion(accountId)) {
        run.finalized.push(accountId);
      }
    } catch (error) {
      run.failed.push(accountId);
      console.error({
        message: "Final deletion failed for an account",
        runAt: now.toISOString(),
        accountId,
        ...(error instanceof Error
          ? { error: { name: error.name, message: error.message } }
          : {}),
      });
    }
  }
  return run;
};

/**
 * The Worker's scheduled handler. Its only Cron Trigger is the daily final-deletion job, which
 * api/wrangler.toml declares and infrastructure/ deploys.
 */
export const scheduled: ExportedHandlerScheduledHandler<
  CloudflareBindings
> = async (controller, env) => {
  await finalizeDueDeletions(
    createStorage(env),
    new Date(controller.scheduledTime),
  );
};
