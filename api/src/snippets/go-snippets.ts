import type { FactValues } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { installLabel, runLabel } from "./labels";
import { render } from "./render";
import { environmentLines, shellWord } from "./shell";
import install from "./templates/go/install.txt";
import run from "./templates/go/run.txt";
import starterUnknownInput from "./templates/go/starter-unknown-input.txt";
import starter from "./templates/go/starter.txt";
import worker from "./templates/go/worker.txt";
import workflowUnknownInput from "./templates/go/workflow-unknown-input.txt";
import workflow from "./templates/go/workflow.txt";
import { importedNames, unique } from "./type-names";

/**
 * The name of the package the activity's file declares, as the generated files use it. The
 * detected facts don't carry the real name, so `workflow.go` asks for it to be changed to match,
 * and the worker and starter import the package under this name whatever it is called.
 */
const appPackage = "app";

/** A name in a Go type that is a type, where it starts: not after a dot, not before one. */
const goTypeIdentifier = /(?<![\w.])[A-Za-z_]\w*(?![\w.])/g;

/** A package qualifier in a Go type, such as `models` in `models.Charge`. */
const goPackageQualifier = /(?<![\w.])[A-Za-z_]\w*(?=\.)/g;

/** Go's own types and the keywords that start a type, which never name the activity's package. */
const goBuiltIns: ReadonlySet<string> = new Set([
  "any",
  "bool",
  "byte",
  "chan",
  "comparable",
  "complex128",
  "complex64",
  "error",
  "float32",
  "float64",
  "func",
  "int",
  "int16",
  "int32",
  "int64",
  "int8",
  "interface",
  "map",
  "rune",
  "string",
  "struct",
  "uint",
  "uint16",
  "uint32",
  "uint64",
  "uint8",
  "uintptr",
]);

/** A Go string literal holding the text. JSON's escapes are valid Go escapes. */
const goString = (text: string) => JSON.stringify(text);

/**
 * A Go expression for a fresh workflow ID: the text, a hyphen, then the current time in
 * nanoseconds. `%` in the text is escaped for `fmt.Sprintf`.
 */
const goIdWithTime = (text: string) =>
  `fmt.Sprintf(${goString(`${text.replaceAll("%", "%%")}-%d`)}, time.Now().UnixNano())`;

/**
 * The type as the worker and starter write it, outside the activity's package: each type it
 * names from that package is qualified with the package's name. `*ChargeRequest` becomes
 * `*app.ChargeRequest`. Go's own types and types from other packages are left as they are.
 */
export const qualifiedGoType = (type: string) =>
  type.replace(goTypeIdentifier, (name) =>
    goBuiltIns.has(name) ? name : `${appPackage}.${name}`,
  );

/** The packages other than the activity's that the types name, each once, in order. */
const otherPackages = (types: readonly (string | null)[]) =>
  unique(
    types.flatMap((type) =>
      importedNames(type, goPackageQualifier, goBuiltIns),
    ),
  );

/**
 * The workflow function's name: the activity's name, then `Workflow`. `ChargeCard` becomes
 * `ChargeCardWorkflow`.
 */
export const goWorkflowName = (activity: string) => `${activity}Workflow`;

/** The workflow's call to the activity, and how it returns the activity's result. */
const executeActivity = (
  activity: string,
  argument: string,
  output: string | null,
) => {
  const call = `workflow.ExecuteActivity(ctx, ${activity}, ${argument})`;
  return output === null
    ? `return ${call}.Get(ctx, nil)`
    : [
        `var result ${output}`,
        `err := ${call}.Get(ctx, &result)`,
        "return result, err",
      ].join("\n");
};

/** The starter's wait for the workflow's result, and what it logs. */
const printResult = (output: string | null) =>
  [
    ...(output === null ? [] : [`var result ${qualifiedGoType(output)}`]),
    `err = we.Get(context.Background(), ${output === null ? "nil" : "&result"})`,
    "if err != nil {",
    '    log.Fatalln("Unable to get workflow result", err)',
    "}",
    output === null
      ? 'log.Println("Workflow completed")'
      : 'log.Println("Workflow result:", result)',
  ].join("\n");

/**
 * The Implement snippets for a Go activity, in the order the Activity page shows them. The
 * module is named after the listing, and the activity's file sits at its root beside
 * `workflow.go`, as in Temporal's Go quickstart.
 */
export const goSnippets = (facts: FactValues, address: Address): Snippet[] => {
  const activity = facts.activity.name;
  const workflowName = goWorkflowName(activity);
  const { input, output } = facts;
  const known = input !== null;
  const packages = otherPackages([input, output]);
  const modules = facts.dependencies.map(({ name }) => shellWord(name));
  const values = {
    activity,
    workflowName,
    inputType: input ?? "",
    starterInputType: input === null ? "" : qualifiedGoType(input),
    workflowResults: output === null ? "error" : `(${output}, error)`,
    executeActivity: executeActivity(
      activity,
      known ? "input" : "args...",
      output,
    ),
    printResult: printResult(output),
    module: shellWord(address.name),
    modulePath: goString(address.name),
    taskQueue: goString(address.name),
    workflowId: goIdWithTime(address.name),
    dependencies: modules.length === 0 ? "" : `go get ${modules.join(" ")}`,
    packagesNote:
      packages.length === 0
        ? ""
        : `// Also import the packages that provide: ${packages.join(", ")}`,
    environment: environmentLines(facts.configurationRead),
  };
  return [
    { label: installLabel, code: render(install, values) },
    {
      label: "workflow.go",
      code: render(known ? workflow : workflowUnknownInput, values),
    },
    { label: "worker/main.go", code: render(worker, values) },
    {
      label: "start/main.go",
      code: render(known ? starter : starterUnknownInput, values),
    },
    { label: runLabel, code: render(run, values) },
  ];
};
