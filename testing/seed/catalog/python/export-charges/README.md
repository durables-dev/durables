## What it does

Lists every charge created after a given time on the payments API: it pages through `GET /charges` with a cursor, and returns the IDs of all the charges it found.

## Behavior

It makes one read-only HTTP call per page, with a 10-second socket timeout each, and heartbeats after every page with the cursor and the IDs collected so far. The Workflow tab's policy sets no heartbeat timeout. Add one if a stuck page should be retried before the start-to-close timeout.

### Retry safety

Safe to retry. It only reads, so repeating it has no effect on the payments API. A retry resumes from the last heartbeat's cursor and keeps the IDs already collected, instead of starting again.

### Permanent errors

None. It raises no non-retryable errors: any HTTP error is re-raised and retried from the last heartbeat.

### On timeout

Nothing has changed in the payments API. A retry picks up from the last page it heartbeated, so pages already read aren't read again.
