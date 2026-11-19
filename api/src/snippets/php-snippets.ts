import type { FactValues } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { heartbeatTimeoutComment, heartbeats } from "./heartbeat-timeout";
import { installLabel, runLabel } from "./labels";
import { render } from "./render";
import { environmentLines } from "./shell";
import install from "./templates/php/install.txt";
import roadrunner from "./templates/php/roadrunner.txt";
import run from "./templates/php/run.txt";
import starterUnknownInput from "./templates/php/starter-unknown-input.txt";
import starter from "./templates/php/starter.txt";
import worker from "./templates/php/worker.txt";
import workflowUnknownInput from "./templates/php/workflow-unknown-input.txt";
import workflow from "./templates/php/workflow.txt";

/** The file the published PHP code is saved as. The worker requires it. */
export const phpActivityFileName = "Activities.php";

/** The RoadRunner config's file name. RoadRunner reads it from the directory it runs in. */
export const phpRoadRunnerFileName = ".rr.yaml";

/** A PHP single-quoted string literal holding the text. */
const phpString = (text: string) =>
  `'${text.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

/** A PHP expression: the text, a hyphen, then a fresh unique ID. */
const phpIdWithUniqueId = (text: string) =>
  `${phpString(`${text}-`)} . uniqid()`;

/**
 * The workflow class's name: the activity method's name in PascalCase, then `Workflow`.
 * `chargeCard` becomes `ChargeCardWorkflow`. A name that would not start with a letter starts
 * with `Activity` instead.
 */
export const phpWorkflowClass = (activity: string) => {
  const pascal = activity
    .split("_")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Za-z]/.test(pascal)
    ? `${pascal}Workflow`
    : `Activity${pascal}Workflow`;
};

/**
 * The Implement snippets for a PHP activity: the install command, the workflow, worker and
 * starter files, the run commands, then the RoadRunner config. The RoadRunner config comes
 * after the run commands, so the first five keep the order every SDK sends. The detected facts
 * don't name the type that declares the activity, so the files use `Activities` and say to
 * change it.
 */
export const phpSnippets = (facts: FactValues, address: Address): Snippet[] => {
  const activity = facts.activity.name;
  const workflowClass = phpWorkflowClass(activity);
  const workflowFile = `${workflowClass}.php`;
  const hasOutput = facts.output !== null;
  const namespaces = facts.dependencies.map(({ name }) => name);
  const values = {
    activityOptions: heartbeats(facts)
      ? [
          "ActivityOptions::new()",
          "    ->withStartToCloseTimeout(30)",
          `    ${heartbeatTimeoutComment("//")}`,
          "    ->withHeartbeatTimeout(10),",
        ].join("\n")
      : "ActivityOptions::new()->withStartToCloseTimeout(30),",
    activity,
    workflowClass,
    workflowFile,
    activityFile: phpActivityFileName,
    inputType: facts.input ?? "",
    returnKeyword: hasOutput ? "return " : "",
    resultAssignment: hasOutput ? "$result = " : "",
    printResult: hasOutput ? "var_dump($result);" : "",
    taskQueue: phpString(address.name),
    workflowId: phpIdWithUniqueId(address.name),
    packagesNote:
      namespaces.length === 0
        ? ""
        : `# Also composer require the packages that provide: ${namespaces.join(", ")}`,
    environment: environmentLines(facts.configurationRead),
  };
  const known = facts.input !== null;
  return [
    { label: installLabel, code: render(install, values) },
    {
      label: workflowFile,
      code: render(known ? workflow : workflowUnknownInput, values),
    },
    { label: "worker.php", code: render(worker, values) },
    {
      label: "starter.php",
      code: render(known ? starter : starterUnknownInput, values),
    },
    { label: runLabel, code: render(run, values) },
    { label: phpRoadRunnerFileName, code: render(roadrunner, values) },
  ];
};
