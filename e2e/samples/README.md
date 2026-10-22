Activity files tests paste into the contribute flow, one per SDK, as `.txt` so Prettier never touches them. They are real activities as a publisher would write them; a sample is never edited to make detection pass.

- `python.txt`, `typescript.txt`, `dotnet.txt` — one accepted activity each. The .NET file is indented with tabs, which "What will be published" must keep.
- `java.txt` — a Java activity, refused by name.
- `python-workflow-only.txt` — uses the SDK but holds a workflow and no activity.
- `python-two-activities.txt` — two activities in one file.
- `not-temporal.txt` — a plain Python script with no Temporal SDK.

The file over the size limit is generated in the test.
