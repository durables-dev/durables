import type { FactValues } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { installLabel, runLabel } from "./labels";
import { render } from "./render";
import { environmentLines } from "./shell";
import install from "./templates/java/install.txt";
import run from "./templates/java/run.txt";
import starterUnknownInput from "./templates/java/starter-unknown-input.txt";
import starter from "./templates/java/starter.txt";
import worker from "./templates/java/worker.txt";
import workflowUnknownInput from "./templates/java/workflow-unknown-input.txt";
import workflow from "./templates/java/workflow.txt";

/** A Java string literal holding the text. */
const javaString = (text: string) => JSON.stringify(text);

/** A Java expression: the text, a hyphen, then a fresh UUID. */
const javaIdWithUuid = (text: string) =>
  `${javaString(`${text}-`)} + UUID.randomUUID()`;

/** The value a variable of a primitive type starts as. Any other type starts as null. */
const primitiveDefaults: Readonly<Record<string, string>> = {
  boolean: "false",
  byte: "0",
  short: "0",
  int: "0",
  long: "0L",
  float: "0f",
  double: "0d",
  char: "'\\0'",
};

/** The value the starter's input starts as, which the developer replaces. */
export const javaDefaultValue = (type: string) =>
  primitiveDefaults[type] ?? "null";

/**
 * The name the generated classes start with: the activity method's name with its first letter
 * capitalised. `sendSms` becomes `SendSms`.
 */
const className = (activity: string) =>
  `${activity.charAt(0).toUpperCase()}${activity.slice(1)}`;

/** The workflow interface's name: the class name, then `Workflow`. */
export const javaWorkflowClass = (activity: string) =>
  `${className(activity)}Workflow`;

/** The worker's class name: the class name, then `Worker`. */
export const javaWorkerClass = (activity: string) =>
  `${className(activity)}Worker`;

/**
 * The Implement snippets for a Java activity, in the order the Activity page shows them. The
 * detected facts don't name the interface that declares the activity or the class that
 * implements it, so the files use `Activities` and `ActivitiesImpl` and say to change them.
 */
export const javaSnippets = (
  facts: FactValues,
  address: Address,
): Snippet[] => {
  const activity = facts.activity.name;
  const workflowClass = javaWorkflowClass(activity);
  const workerClass = javaWorkerClass(activity);
  const packages = facts.dependencies.map(({ name }) => name);
  const output = facts.output;
  const values = {
    activity,
    workflowClass,
    workerClass,
    inputType: facts.input ?? "",
    inputDefault: javaDefaultValue(facts.input ?? ""),
    returnType: output ?? "void",
    returnKeyword: output === null ? "" : "return ",
    resultAssignment: output === null ? "" : `${output} result = `,
    printResult: output === null ? "" : "System.out.println(result);",
    taskQueue: javaString(address.name),
    workflowId: javaIdWithUuid(address.name),
    packagesNote:
      packages.length === 0
        ? ""
        : `<!-- Also add the Maven dependencies that provide: ${packages.join(", ")} -->`,
    environment: environmentLines(facts.configurationRead),
  };
  const known = facts.input !== null;
  return [
    { label: installLabel, code: render(install, values) },
    {
      label: `${workflowClass}.java`,
      code: render(known ? workflow : workflowUnknownInput, values),
    },
    { label: `${workerClass}.java`, code: render(worker, values) },
    {
      label: "Starter.java",
      code: render(known ? starter : starterUnknownInput, values),
    },
    { label: runLabel, code: render(run, values) },
  ];
};
