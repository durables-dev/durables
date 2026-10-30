import type { CodeLanguage } from "@/lib/highlighter";
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
export interface Implement {
  install: string | undefined;
  files: ImplementFile[];
  run: string | undefined;
}

export type ImplementVersion = Pick<
  VersionResponse,
  "address" | "code" | "activityFileName" | "snippets"
>;

const languages: Record<VersionResponse["sdk"], CodeLanguage> = {
  Python: "python",
  TypeScript: "typescript",
  ".NET": "csharp",
};

/** The language the activity and generated files are highlighted in. */
export function sdkLanguage(sdk: VersionResponse["sdk"]): CodeLanguage {
  return languages[sdk];
}

/**
 * Splits a version into what Implement shows. The API sends the snippets in the order the page
 * shows them: the install command, the workflow, worker and starter files, then the run
 * commands. The activity file is the published code, under the activity file name, and comes
 * first. Nothing is reindented or rewritten.
 */
export function implementFiles({
  address,
  code,
  activityFileName,
  snippets,
}: ImplementVersion): Implement {
  const [install, workflow, worker, starter, run] = snippets;
  const activity: ImplementFile = {
    role: "activity",
    name: activityFileName,
    code,
    description: `The activity itself, exactly as published in ${address}.`,
  };
  const generated: [ImplementFileRole, string, typeof workflow][] = [
    ["workflow", "A minimal workflow that calls the activity.", workflow],
    [
      "worker",
      "Runs a worker that registers the workflow and the activity.",
      worker,
    ],
    ["starter", "Starts one run of the workflow.", starter],
  ];
  const files = [activity];
  for (const [role, description, snippet] of generated) {
    if (snippet !== undefined) {
      files.push({
        role,
        name: snippet.label,
        code: snippet.code,
        description,
      });
    }
  }
  return { install: install?.code, files, run: run?.code };
}
