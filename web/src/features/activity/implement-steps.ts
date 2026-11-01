import type { VersionResponse } from "./listing-queries";

/** What a file in Implement is for. The activity file is the published code. */
export type ImplementFileRole = "activity" | "workflow" | "worker" | "starter";

/** One of the four files Implement shows, each in its own tab. */
export interface ImplementFile {
  role: ImplementFileRole;
  /** The file's name for the SDK, such as "activities.py". It names the tab. */
  name: string;
  /** The code, exactly as published or as generated. */
  code: string;
  /** One line saying what the file is, shown under the tabs. */
  description: string;
}

/** What Implement shows: the install command, the four files and the run commands. */
export interface ImplementSteps {
  installCommand: string | undefined;
  files: ImplementFile[];
  runCommands: string | undefined;
}

export type ImplementVersion = Pick<
  VersionResponse,
  "address" | "code" | "activityFileName" | "snippets"
>;

type Snippet = VersionResponse["snippets"][number];

/**
 * Splits a version into what Implement shows. The API sends the snippets in the order the page
 * shows them: the install command, the workflow, worker and starter files, then the run
 * commands. The activity file is the published code, under the activity file name, and comes
 * first. Nothing is reindented or rewritten.
 */
export function implementSteps({
  address,
  code,
  activityFileName,
  snippets,
}: ImplementVersion): ImplementSteps {
  const [installCommand, workflow, worker, starter, runCommands] = snippets;
  const activity: ImplementFile = {
    role: "activity",
    name: activityFileName,
    code,
    description: `The activity itself, exactly as published in ${address}.`,
  };
  const generated: {
    role: ImplementFileRole;
    description: string;
    snippet: Snippet | undefined;
  }[] = [
    {
      role: "workflow",
      description: "A minimal workflow that calls the activity.",
      snippet: workflow,
    },
    {
      role: "worker",
      description:
        "Runs a worker that registers the workflow and the activity.",
      snippet: worker,
    },
    {
      role: "starter",
      description: "Starts one run of the workflow.",
      snippet: starter,
    },
  ];
  const files = [activity];
  for (const { role, description, snippet } of generated) {
    if (snippet !== undefined) {
      files.push({
        role,
        name: snippet.label,
        code: snippet.code,
        description,
      });
    }
  }
  return {
    installCommand: installCommand?.code,
    files,
    runCommands: runCommands?.code,
  };
}
