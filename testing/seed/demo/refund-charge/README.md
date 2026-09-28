## What it does

Refunds a charge on the payments API: it sends `POST /refunds` with the charge ID and the amount, in minor units, and returns the refund's ID and status. Use it as the compensation for `charge-card`.

## Behavior

It makes one HTTP call per attempt, with a 10-second socket timeout. Run it with the recommended timeout and retry policy from the Workflow tab.

### Retry safety

Safe to retry. Every attempt sends the same `Idempotency-Key` header, built from the workflow ID and the activity ID, so the payments API returns the original refund instead of refunding twice.

### Permanent errors

`ChargeNotFound`: the payments API answered 404 because no charge has that ID. It is raised as a non-retryable `ApplicationError`, so the workflow sees it at once. Any other HTTP error is re-raised and retried.

### On timeout

If the call times out, the refund may or may not have been made. The retry sends the same idempotency key, so it either makes the refund or returns the one already made. It never refunds twice.
