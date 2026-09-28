## What it does

Voids an authorised charge on the payments API before it is captured: it sends `POST /charges/<id>/void` with a reason, and returns the charge's ID and status.

## Behavior

It makes one HTTP call per attempt, with a 10-second timeout, and passes the activity's cancellation token to the call. Run it with the recommended timeout and retry policy from the Workflow tab. There is no compensation listed for it.

### Retry safety

Safe to retry. Every attempt sends the same `Idempotency-Key` header, built from the workflow ID and the activity ID, so the payments API returns the original void instead of voiding the charge again.

### Permanent errors

`ChargeAlreadyCaptured`: the payments API answered 409 because the charge was already captured, so it can no longer be voided. It is thrown as an `ApplicationFailureException` with `nonRetryable: true`, so the workflow sees it at once. Any other error status throws from `EnsureSuccessStatusCode` and is retried.

### On timeout

If the call times out, the charge may or may not have been voided. The retry sends the same idempotency key, so it either voids the charge or returns the void already made.
