import type { Facts } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { installLabel, runLabel } from "./labels";
import { render } from "./render";
import { environmentLines } from "./shell";
import install from "./templates/python/install.txt";
import run from "./templates/python/run.txt";
import starterUnknownInput from "./templates/python/starter-unknown-input.txt";
import starter from "./templates/python/starter.txt";
import worker from "./templates/python/worker.txt";
import workflowUnknownInput from "./templates/python/workflow-unknown-input.txt";
import workflow from "./templates/python/workflow.txt";
import { importedNames, sortedNames, unique } from "./type-names";

/** A name in a Python type, where it starts: not part of a longer name, not after a dot. */
const pythonTypeIdentifier = /(?<![\w.])[A-Za-z_]\w*/g;

/** Python's own types and constants, which are never imported from the activity's file. */
const pythonBuiltIns: ReadonlySet<string> = new Set([
  "None",
  "bool",
  "bytearray",
  "bytes",
  "complex",
  "dict",
  "float",
  "frozenset",
  "int",
  "list",
  "memoryview",
  "object",
  "range",
  "set",
  "str",
  "tuple",
  "type",
]);

/** A Python string literal holding the text. JSON's escapes are valid Python escapes. */
const pythonString = (text: string) => JSON.stringify(text);

/** A Python f-string: the text, a hyphen, then a fresh UUID. Braces in the text are escaped. */
const pythonIdWithUuid = (text: string) =>
  `f${JSON.stringify(`${text.replaceAll("{", "{{").replaceAll("}", "}}")}-{uuid.uuid4()}`)}`;

/**
 * The workflow class's name: the activity's name in PascalCase, then `Workflow`.
 * `charge_card` becomes `ChargeCardWorkflow`. A name that would not start with a letter starts
 * with `Activity` instead.
 */
export const pythonWorkflowClass = (activity: string) => {
  const pascal = activity
    .split("_")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Za-z]/.test(pascal)
    ? `${pascal}Workflow`
    : `Activity${pascal}Workflow`;
};

/** The Implement snippets for a Python activity, in the order the Activity page shows them. */
export const pythonSnippets = (facts: Facts, address: Address): Snippet[] => {
  const activity = facts.activity.name;
  const workflowClass = pythonWorkflowClass(activity);
  const inputNames = importedNames(
    facts.input,
    pythonTypeIdentifier,
    pythonBuiltIns,
  );
  const outputNames = importedNames(
    facts.output,
    pythonTypeIdentifier,
    pythonBuiltIns,
  );
  const usesThreadPool = facts.runsAs !== "async";
  // Detection reports import names, which often differ from PyPI's (yaml is PyYAML), and
  // installing one by its import name can fetch someone else's package.
  const modules = facts.dependencies.map(({ name }) => name);
  const values = {
    activity,
    workflowClass,
    inputType: facts.input ?? "",
    returns: facts.output === null ? "" : ` -> ${facts.output}`,
    imports: sortedNames(
      unique([activity, ...inputNames, ...outputNames]),
    ).join(", "),
    inputImport:
      inputNames.length === 0
        ? ""
        : `from activities import ${sortedNames(inputNames).join(", ")}`,
    executorImport: usesThreadPool
      ? "from concurrent.futures import ThreadPoolExecutor"
      : "",
    activityExecutor: usesThreadPool
      ? "activity_executor=ThreadPoolExecutor(max_workers=10),"
      : "",
    taskQueue: pythonString(address.name),
    workflowId: pythonIdWithUuid(address.name),
    packagesNote:
      modules.length === 0
        ? ""
        : `# Also install the PyPI packages that provide: ${modules.join(", ")}`,
    environment: environmentLines(facts.configurationRead),
  };
  const known = facts.input !== null;
  return [
    { label: installLabel, code: render(install, values) },
    {
      label: "workflows.py",
      code: render(known ? workflow : workflowUnknownInput, values),
    },
    { label: "worker.py", code: render(worker, values) },
    {
      label: "start.py",
      code: render(known ? starter : starterUnknownInput, values),
    },
    { label: runLabel, code: render(run, values) },
  ];
};
