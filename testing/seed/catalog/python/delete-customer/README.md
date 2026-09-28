## What it does

Deletes a customer on the payments API: it sends `DELETE /customers/<id>` and returns the customer's ID and whether it was already deleted.

## Behavior

It makes one HTTP call per attempt, with a 10-second socket timeout. A deleted customer can't be restored, so there is no compensation.

### Retry safety

Safe to retry. If the payments API answers 404, the customer is already gone, for example deleted by an earlier attempt that timed out, so the activity returns success with `already_deleted` set instead of failing.

### Permanent errors

None. It raises no non-retryable errors: a 404 counts as success, and any other HTTP error is re-raised and retried.

### On timeout

If the call times out, the customer may or may not have been deleted. A retry deletes it, or gets a 404 and reports it as already deleted. Either way the customer ends up deleted.
