// Account deletion's grace period (ADR 0015). A deleted account is pending for 30 days, and can
// be restored by signing in with the same provider account during them. After that the daily
// final-deletion job makes the deletion final.

/** How many days a deleted account can still be restored. */
export const deletionGracePeriodDays = 30;

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/** The time a deletion asked for at this time becomes final: 30 days later. */
export const finalDeletionAt = (deletionRequestedAt: Date): Date =>
  new Date(
    deletionRequestedAt.getTime() +
      deletionGracePeriodDays * millisecondsPerDay,
  );
