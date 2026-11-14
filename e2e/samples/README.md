Activity files tests paste into the contribute flow, one per SDK, as `.txt` so Prettier never touches them. They are real activities as a publisher would write them; a sample is never edited to make detection pass.

- `python.txt`, `typescript.txt`, `dotnet.txt` — one accepted activity each. The .NET file is indented with tabs, which "What will be published" must keep.
- `java.txt` — an accepted Java activity: an `@ActivityInterface` interface with its implementation nested inside it.
- `go.txt` — an accepted Go activity that uploads a report to Amazon S3. Indented with tabs, as `gofmt` writes it.
- `ruby.txt` — an accepted Ruby activity, a `Temporalio::Activity::Definition`, that sends a Stripe invoice. Ruby declares no types, so its input and output are not detected.
- `php.txt` — an accepted PHP activity, `#[ActivityInterface]` on a class, that posts a Slack message. Its Implement section has a fifth file, `.rr.yaml`.
- `rust.txt` — an accepted Rust activity, `#[activity]` in an `#[activities]` impl, that updates an order in Postgres.
- `go-no-marker.txt` — a Go activity that imports no Temporal package, as in Temporal's Go quickstart, so its SDK is inferred from the code.
- `python-workflow-only.txt` — uses the SDK but holds a workflow and no activity.
- `python-two-activities.txt` — two activities in one file.
- `python-no-configuration.txt` — a synchronous activity that reads no environment variables and imports nothing beyond the standard library and the SDK, so it has no integrations and no dependencies.
- `not-temporal.txt` — a plain Python script with no Temporal SDK.

The file over the size limit is generated in the test.
