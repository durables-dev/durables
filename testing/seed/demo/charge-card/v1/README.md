## What it does

Charges a card on the payments API: it sends `POST /charges` with the amount, in minor units, the currency and the card number, and returns the charge's ID and status. Its compensation is `refund-charge`.

## Behavior

It makes one HTTP call per attempt, with a 10-second socket timeout. Run it with the recommended timeout and retry policy from the Workflow tab.

### Retry safety

Safe to retry. Every attempt sends the same `Idempotency-Key` header, built from the workflow ID and the activity ID, so the payments API returns the original charge instead of charging the card twice.

### Permanent errors

`CardDeclined`: the payments API answered 402 because the card was declined. It is raised as a non-retryable `ApplicationError`, so the workflow sees it at once instead of retrying a card that will keep declining. Any other HTTP error is re-raised and retried.

### On timeout

If the call times out, the card may or may not have been charged. The retry sends the same idempotency key, so it either makes the charge or returns the one already made. The card is never charged twice.
