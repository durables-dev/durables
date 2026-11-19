import type { FactValues } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { heartbeatTimeoutLines } from "./heartbeat-timeout";
import { installLabel, runLabel } from "./labels";
import { render } from "./render";
import { environmentLines, shellWord } from "./shell";
import install from "./templates/dotnet/install.txt";
import run from "./templates/dotnet/run.txt";
import starterUnknownInput from "./templates/dotnet/starter-unknown-input.txt";
import starter from "./templates/dotnet/starter.txt";
import worker from "./templates/dotnet/worker.txt";
import workflowUnknownInput from "./templates/dotnet/workflow-unknown-input.txt";
import workflow from "./templates/dotnet/workflow.txt";

/** A C# string literal holding the text. */
const csharpString = (text: string) => JSON.stringify(text);

/** A C# interpolated string: the text, a hyphen, then a fresh GUID. The text is escaped. */
const csharpIdWithGuid = (text: string) =>
  `$${JSON.stringify(`${text.replaceAll("{", "{{").replaceAll("}", "}}")}-{Guid.NewGuid()}`)}`;

/**
 * The workflow class's name: the activity method's name without an `Async` ending, then
 * `Workflow`. `ChargeCardAsync` becomes `ChargeCardWorkflow`.
 */
export const dotnetWorkflowClass = (activity: string) => {
  const withoutAsync = activity.replace(/Async$/, "");
  return `${withoutAsync === "" ? activity : withoutAsync}Workflow`;
};

/**
 * The Implement snippets for a .NET activity, in the order the Activity page shows them. The
 * detected facts don't name the class that declares the activity, so the files use
 * `Activities` and say to change it.
 */
export const dotnetSnippets = (
  facts: FactValues,
  address: Address,
): Snippet[] => {
  const activity = facts.activity.name;
  const workflowClass = dotnetWorkflowClass(activity);
  const hasOutput = facts.output !== null;
  const namespaces = facts.dependencies.map(({ name }) => name);
  const values = {
    heartbeatTimeout: heartbeatTimeoutLines(
      facts,
      "//",
      "HeartbeatTimeout = TimeSpan.FromSeconds(10),",
    ),
    activity,
    workflowClass,
    inputType: facts.input ?? "",
    returnType: hasOutput ? `Task<${facts.output}>` : "Task",
    returnKeyword: hasOutput ? "return " : "",
    resultAssignment: hasOutput ? "var result = " : "",
    printResult: hasOutput ? "Console.WriteLine(result);" : "",
    taskQueue: csharpString(address.name),
    workflowId: csharpIdWithGuid(address.name),
    project: shellWord(address.name),
    packagesNote:
      namespaces.length === 0
        ? ""
        : `# Also add the NuGet packages that provide: ${namespaces.join(", ")}`,
    environment: environmentLines(facts.configurationRead),
  };
  const known = facts.input !== null;
  return [
    { label: installLabel, code: render(install, values) },
    {
      label: `${workflowClass}.cs`,
      code: render(known ? workflow : workflowUnknownInput, values),
    },
    { label: "Program.cs", code: render(worker, values) },
    {
      label: "Starter.cs",
      code: render(known ? starter : starterUnknownInput, values),
    },
    { label: runLabel, code: render(run, values) },
  ];
};
