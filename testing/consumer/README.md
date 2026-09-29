# Consumer project (demo steps 11 and 12)

This directory is the consumer's empty Python project. Only this README and
`reset.sh` are tracked. Everything pasted here during the demo, and the
`.venv`, is gitignored.

## Pre-demo checklist

Nothing here is timed. Run it from the repository root before every demo.

1. **Configure the stack.** If `infrastructure/.env` doesn't exist yet:

       cp infrastructure/.env.example infrastructure/.env

2. **Start the stack from empty.** `down -v` wipes the documents and the
   database, so the demo starts with nothing published:

       docker compose -f infrastructure/compose.yaml down -v
       docker compose -f infrastructure/compose.yaml up -d --build

   This starts `web` (http://localhost:5173), `api` (http://localhost:3000),
   `postgres`, `temporal` (gRPC on `localhost:7233`, UI at
   http://localhost:8233) and `mock-payments` (http://localhost:4000).
   Temporal keeps its history in memory, so restarting it empties the history.

3. **Check that the stack is up.** Open the Temporal UI at
   http://localhost:8233. Then check that mock-payments rejects a request
   without a key:

       curl -i -X POST http://localhost:4000/charges

   Expect `401` and `{"error":"invalid_api_key"}`.

4. **Publish the seeds.** This publishes `refund-charge` and the eight
   catalog activities as the publisher:

       cd testing/seed && npm ci && npm run publish-seeds && cd ../..

5. **Publish `charge-card` through demo steps 1–4.** In web, signed in as
   `kisasa`, use the files in `testing/seed/demo/charge-card/v1/`: paste
   `charge_card.py`, answer the declaration form from `declaration.json`,
   write the README from `README.md`, enter the example input from
   `example-input.json`, and publish. Check that
   `durables.dev/kisasa/charge-card@1.0.0` opens.

6. **Empty the consumer project.**

       testing/consumer/reset.sh

7. **Open two terminals in `testing/consumer/`**, one for the worker and one
   for the starter, and activate the venv in both:

       cd testing/consumer
       source .venv/bin/activate          # Git Bash on Windows: source .venv/Scripts/activate

8. **Set the consumer's own credentials** in both terminals, under the names
   the listing's configuration section lists. The key is the
   `MOCK_PAYMENTS_API_KEY` value in `infrastructure/.env`
   (`sk_test_durables` unless you changed it):

   <!-- POC-SHORTCUT: SC-018 -->

       export MOCK_PAYMENTS_URL=http://localhost:4000
       export MOCK_PAYMENTS_API_KEY=sk_test_durables

   These stand in for the credentials a real consumer already holds with
   their payment provider. By the brief's exception, they don't count as
   needing anything beyond the listing.

9. **Switch web to `demo-consumer`**, and keep the `charge-card` listing one
   click away. The clock starts when the listing opens.

## During the demo (steps 10–11, timed)

Only what the listing provides. No Temporal code is written by hand.

1. Open the `charge-card` listing. Start the clock.
2. Copy the **Install** tab and run it in the worker terminal
   (`pip install temporalio`).
3. Copy the **Activity**, **Workflow**, **Worker** and **Starter** tabs into
   this directory as `charge_card.py`, `workflow.py`, `worker.py` and
   `starter.py`, the filenames shown on each tab.
4. In the worker terminal: `python worker.py`. It prints that it is listening
   on task queue `'charge-card'`.
5. In the starter terminal: `python starter.py`. It prints
   `ChargeCardResult(charge_id='ch_…', status='succeeded')`.
6. In the Temporal UI (http://localhost:8233), open the `charge-card-…`
   workflow. It shows **Completed**, and its event history has
   `ActivityTaskCompleted` with the same `charge_id` and `status`. Stop the
   clock.

To run it again from empty, stop the worker and repeat from step 6 of the
checklist.
