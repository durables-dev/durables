import type { Facts } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { installLabel, runLabel } from "./labels";
import { render } from "./render";
import { environmentLines, shellWord } from "./shell";
import install from "./templates/typescript/install.txt";
import run from "./templates/typescript/run.txt";
import starterUnknownInput from "./templates/typescript/starter-unknown-input.txt";
import starter from "./templates/typescript/starter.txt";
import worker from "./templates/typescript/worker.txt";
import workflowUnknownInput from "./templates/typescript/workflow-unknown-input.txt";
import workflow from "./templates/typescript/workflow.txt";
import { importedNames, sortedNames, unique } from "./type-names";

/** A name in a TypeScript type, where it starts: not part of a longer name, not after a dot. */
const typescriptTypeIdentifier = /(?<![\w$.])[A-Za-z_$][\w$]*/g;

/** TypeScript's own and global types, which are never imported from the activity's file. */
const typescriptBuiltIns: ReadonlySet<string> = new Set([
  "Array",
  "ArrayBuffer",
  "Awaited",
  "Date",
  "Error",
  "Exclude",
  "Extract",
  "Map",
  "NonNullable",
  "Omit",
  "Partial",
  "Pick",
  "Promise",
  "ReadonlyArray",
  "ReadonlyMap",
  "ReadonlySet",
  "Readonly",
  "Record",
  "RegExp",
  "Required",
  "Set",
  "Uint8Array",
  "any",
  "bigint",
  "boolean",
  "false",
  "never",
  "null",
  "number",
  "object",
  "string",
  "symbol",
  "true",
  "undefined",
  "unknown",
  "void",
]);

/** A TypeScript string literal holding the text. JSON's escapes are valid TypeScript escapes. */
const typescriptString = (text: string) => JSON.stringify(text);

/** A template literal: the text, a hyphen, then a fresh UUID. The text is escaped. */
const typescriptIdWithUuid = (text: string) =>
  `\`${text.replace(/[\\`]|\$\{/g, (found) => `\\${found}`)}-\${crypto.randomUUID()}\``;

/**
 * The Implement snippets for a TypeScript activity, in the order the Activity page shows them.
 * The activity is only ever reached as a member, such as `activities.delete`, so a name that is
 * a reserved word stays valid.
 */
export const typescriptSnippets = (
  facts: Facts,
  address: Address,
): Snippet[] => {
  const activity = facts.activity.name;
  const inputNames = importedNames(
    facts.input,
    typescriptTypeIdentifier,
    typescriptBuiltIns,
  );
  const outputNames = importedNames(
    facts.output,
    typescriptTypeIdentifier,
    typescriptBuiltIns,
  );
  const typeImport = (names: readonly string[]) =>
    names.length === 0
      ? ""
      : `import type { ${sortedNames(names).join(", ")} } from "./activities";`;
  const known = facts.input !== null;
  const values = {
    activity,
    workflowFunction: `${activity}Workflow`,
    inputType: facts.input ?? "",
    returns: facts.output === null ? "" : `: Promise<${facts.output}>`,
    heartbeatTimeout:
      facts.heartbeats.length === 0 ? "" : 'heartbeatTimeout: "10 seconds",',
    taskQueue: typescriptString(address.name),
    workflowId: typescriptIdWithUuid(address.name),
    packages: unique([
      "@temporalio/activity",
      "@temporalio/client",
      "@temporalio/worker",
      "@temporalio/workflow",
      ...facts.dependencies.map(({ name }) => name),
    ])
      .map(shellWord)
      .join(" "),
    environment: environmentLines(facts.configurationRead),
  };
  return [
    { label: installLabel, code: render(install, values) },
    {
      label: "workflows.ts",
      code: render(known ? workflow : workflowUnknownInput, {
        ...values,
        typeImport: typeImport(
          unique([...(known ? inputNames : []), ...outputNames]),
        ),
      }),
    },
    { label: "worker.ts", code: render(worker, values) },
    {
      label: "start.ts",
      code: render(known ? starter : starterUnknownInput, {
        ...values,
        typeImport: typeImport(inputNames),
      }),
    },
    { label: runLabel, code: render(run, values) },
  ];
};
