## What it does

Creates a customer on the payments API: it sends `POST /customers` with the customer's email and name, and returns the new customer's ID.

## Behavior

It makes one HTTP call per attempt, with a 10-second socket timeout. There is no compensation: nothing in the catalog deletes the customer it creates.

### Retry safety

Safe to retry. Every attempt sends the same `Idempotency-Key` header, built from the workflow ID and the activity ID, so the payments API returns the customer already created instead of creating a second one.

### Permanent errors

`InvalidCustomer`: the payments API answered 422 because the email or name was rejected. It is raised as a non-retryable `ApplicationError`, so the workflow sees it at once. Any other HTTP error is re-raised and retried.

### On timeout

If the call times out, the customer may or may not have been created. The retry sends the same idempotency key, so it either creates the customer or returns the one already created. It never creates two.
