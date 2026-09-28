## What it does

Charges a card on the payments API: it sends `POST /charges` with the amount, in minor units, the currency and the card number, and returns the charge's ID and status. Its compensation is `refund-charge`.

## Behavior

It makes one HTTP call per attempt, with a 10-second socket timeout, and sends no idempotency key. The Workflow tab's retry policy allows up to five attempts, and every attempt that reaches the payments API makes a new charge.

### Retry safety

Not safe to retry. It sends no `Idempotency-Key` header, so every attempt that reaches the payments API creates a new charge. If Temporal retries it after a charge was made, the card is charged twice. Refund the extra charge with `refund-charge`.

### Permanent errors

`CardDeclined`: the payments API answered 402 because the card was declined. It is raised as a non-retryable `ApplicationError`, so the workflow sees it at once. Any other HTTP error is re-raised and retried.

### On timeout

If the call times out, the charge may or may not have been made. A retry sends a new request with nothing to link it to the first, so if the first charge was made, the retry makes a second one.
