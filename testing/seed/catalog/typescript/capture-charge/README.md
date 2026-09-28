## What it does

Captures an authorised charge on the payments API: it sends `POST /charges/<id>/capture` with the amount to capture, in minor units, and returns the charge's ID and status.

## Behavior

It makes one HTTP call per attempt, with a 10-second timeout. Run it with the recommended timeout and retry policy from the Workflow tab. There is no compensation listed for it.

### Retry safety

Safe to retry. Every attempt sends the same `Idempotency-Key` header, built from the workflow ID and the activity ID, so the payments API returns the original capture instead of capturing the charge twice.

### Permanent errors

`ChargeNotCapturable`: the payments API answered 409 because the charge can't be captured, for example because it was already captured or was voided. It is thrown with `ApplicationFailure.nonRetryable`, so the workflow sees it at once. Any other error status is thrown as a plain `Error` and retried.

### On timeout

If the call times out, the charge may or may not have been captured. The retry sends the same idempotency key, so it either captures the charge or returns the capture already made. The charge is never captured twice.
