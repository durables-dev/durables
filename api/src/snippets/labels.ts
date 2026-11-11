import type { AcceptedSdk } from "../checks/facts";

/** The label of the first snippet: the command that installs the dependencies. */
export const installLabel = "Install";

/** The label of the last snippet: the commands that run the worker and start the workflow. */
export const runLabel = "Run";

/**
 * The file the published code is saved as. The generated files import the activity from it,
 * so the Activity page names the published code's tab with it.
 */
export const activityFileName: Readonly<Record<AcceptedSdk, string>> = {
  Python: "activities.py",
  TypeScript: "activities.ts",
  ".NET": "Activities.cs",
};
