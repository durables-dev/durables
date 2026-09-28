## What it does

Emails a receipt for a charge through the payments API: it sends `POST /charges/<id>/receipts` with the email address, and returns the receipt's ID.

## Behavior

It makes one HTTP call per attempt, with a 10-second socket timeout, and sends no idempotency key. A sent email can't be taken back, so there is no compensation.

### Retry safety

Not safe to retry without care. Each attempt that reaches the payments API sends another receipt, so a retry can email the customer a duplicate. Duplicates are harmless but visible.

### Permanent errors

`ChargeNotFound`: the payments API answered 404 because no charge has that ID. It is raised as a non-retryable `ApplicationError`, so the workflow sees it at once. Any other HTTP error is re-raised and retried.

### On timeout

If the call times out, the receipt may or may not have been sent. A retry sends another one, so the customer may get two.
