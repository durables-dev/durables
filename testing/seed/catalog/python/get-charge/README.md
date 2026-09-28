## What it does

Reads a charge from the payments API: it sends `GET /charges/<id>` and returns the charge's ID, amount in minor units, currency and status.

## Behavior

It makes one read-only HTTP call per attempt, with a 10-second socket timeout. It changes nothing in the payments API.

### Retry safety

Safe to retry. It only reads, so repeating it any number of times has no effect on the payments API.

### Permanent errors

`ChargeNotFound`: the payments API answered 404 because no charge has that ID. It is raised as a non-retryable `ApplicationError`, so the workflow sees it at once. Any other HTTP error is re-raised and retried.

### On timeout

Nothing has changed in the payments API. A retry reads the charge again.
