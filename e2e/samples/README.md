Activity files tests paste into the contribute flow, one per SDK, as `.txt` so Prettier never touches them. They are real activities as a publisher would write them; a sample is never edited to make detection pass.

- `python.txt`, `typescript.txt`, `dotnet.txt` — one accepted activity each. The .NET file is indented with tabs, which "What will be published" must keep.
- `java.txt` — an accepted Java activity: an `@ActivityInterface` interface with its implementation nested inside it.
- `python-workflow-only.txt` — uses the SDK but holds a workflow and no activity.
- `python-two-activities.txt` — two activities in one file.
- `python-no-configuration.txt` — a synchronous activity that reads no environment variables and imports nothing beyond the standard library and the SDK, so it has no integrations and no dependencies.
- `not-temporal.txt` — a plain Python script with no Temporal SDK.

The file over the size limit is generated in the test.
