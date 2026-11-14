import type { VersionResponse } from "./listing-queries";

/**
 * What a file in Implement is for. The activity file is the published code. An "other" file is
 * one the worker needs beyond the workflow, worker and starter, such as a runtime's config.
 */
export type ImplementFileRole =
  "activity" | "workflow" | "worker" | "starter" | "other";

/** One of the files Implement shows, each in its own tab. */
export interface ImplementFile {
  role: ImplementFileRole;
  /** The file's name for the SDK, such as "activities.py". It names the tab. */
  name: string;
  /** The code, exactly as published or as generated. */
  code: string;
  /** One line saying what the file is, shown under the tabs. */
  description: string;
  /**
   * Whether the file is in the SDK's language, so it is highlighted in it. An "other" file is
   * not: its format, such as YAML, may be a different language, so it shows as plain text.
   */
  inSdkLanguage: boolean;
}

/** What Implement shows: the install command, the files and the run commands. */
export interface ImplementSteps {
  installCommand: string | undefined;
  files: ImplementFile[];
  runCommands: string | undefined;
}

export type ImplementVersion = Pick<
  VersionResponse,
  "address" | "code" | "activityFileName" | "snippets"
>;

/** The label the api gives the install command's snippet. */
const INSTALL_LABEL = "Install";

/** The label the api gives the run commands' snippet. */
const RUN_LABEL = "Run";

/** What the first three generated files are for, in the order the api sends them. */
const GENERATED_ROLES: readonly {
  role: ImplementFileRole;
  description: string;
}[] = [
  {
    role: "workflow",
    description: "A minimal workflow that calls the activity.",
  },
  {
    role: "worker",
    description: "Runs a worker that registers the workflow and the activity.",
  },
  {
    role: "starter",
    description: "Starts one run of the workflow.",
  },
];

const OTHER_FILE_DESCRIPTION = "Another file the worker needs.";

/**
 * Splits a version into what Implement shows. The install command and the run commands are
 * the snippets labelled "Install" and "Run", wherever they are. Every other snippet is a file,
 * in the order the api sends them: the first three are the workflow, worker and starter, and
 * any after those are other files the worker needs. The activity file is the published code,
 * under the activity file name, and comes first. Nothing is reindented or rewritten.
 */
export function implementSteps({
  address,
  code,
  activityFileName,
  snippets,
}: ImplementVersion): ImplementSteps {
  const install = snippets.find((snippet) => snippet.label === INSTALL_LABEL);
  const run = snippets.find((snippet) => snippet.label === RUN_LABEL);
  const generated = snippets.filter(
    (snippet) => snippet !== install && snippet !== run,
  );
  const activity: ImplementFile = {
    role: "activity",
    name: activityFileName,
    code,
    description: `The activity itself, exactly as published in ${address}.`,
    inSdkLanguage: true,
  };
  const files = [
    activity,
    ...generated.map((snippet, index): ImplementFile => {
      const known = GENERATED_ROLES[index];
      return {
        role: known?.role ?? "other",
        name: snippet.label,
        code: snippet.code,
        description: known?.description ?? OTHER_FILE_DESCRIPTION,
        inSdkLanguage: known !== undefined,
      };
    }),
  ];
  return {
    installCommand: install?.code,
    files,
    runCommands: run?.code,
  };
}

const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/** The heading of Implement's files step, naming how many files there are. */
export function filesHeading(count: number): string {
  if (count === 1) return "2. Add this file to your project";
  const word = COUNT_WORDS[count] ?? String(count);
  return `2. Add these ${word} files to your project`;
}
