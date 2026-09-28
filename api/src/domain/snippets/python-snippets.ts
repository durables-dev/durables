import type { Detection, InputType } from "../../model/detection.js";
import type { Snippet } from "../../model/listing.js";
import { toPascalCase, toSnakeCase } from "../addresses/names.js";
import { toPythonLiteral } from "./python-literal.js";
import { renderTemplate } from "./render-template.js";
import { snippetTemplate } from "./templates.js";

// The five Python snippet tabs, generated from the templates in
// templates/python/ and the metadata stored with the listing. The activity tab
// is the stored code itself. Every file is complete and runs as pasted.

export type SnippetSource = {
  /** The listing name, used as the task queue and the workflow ID prefix. */
  name: string;
  code: string;
  detection: Detection;
  exampleInput: Record<string, unknown>;
};

const TYPING_NAMES = new Set([
  "Any",
  "Optional",
  "Union",
  "List",
  "Dict",
  "Tuple",
  "Set",
  "FrozenSet",
  "Sequence",
  "Mapping",
  "Iterable",
  "Literal",
]);

export function generatePythonSnippets(source: SnippetSource): Snippet[] {
  const { name, code, detection, exampleInput } = source;
  const activityName = detection.activityName.value;
  const activityModule = toSnakeCase(activityName);
  const workflowClass = `${toPascalCase(activityName)}Workflow`;
  const activityFunction = findActivityFunction(code);
  const moduleNames = topLevelNames(code);
  const params = detection.inputTypes;
  const outputType = unquote(detection.outputType.value);

  const annotationNames = [...params.map((p) => unquote(p.type)), outputType].flatMap(identifiers);
  const moduleTypes = unique(annotationNames.filter((id) => moduleNames.has(id) && id !== activityFunction.name));
  const typingNames = unique(annotationNames.filter((id) => TYPING_NAMES.has(id) && !moduleNames.has(id)));

  const workflow = renderTemplate(snippetTemplate("python", "workflow"), {
    typing_import: typingNames.length > 0 ? `from typing import ${typingNames.join(", ")}` : "",
    activity_module: activityModule,
    workflow_imports: [...moduleTypes, activityFunction.name].join(", "),
    workflow_class: workflowClass,
    run_params: params.map((p) => `, ${p.name}: ${unquote(p.type)}`).join(""),
    output_type: outputType,
    activity_function: activityFunction.name,
    activity_args: argumentsFor(params.map((p) => p.name)),
    non_retryable_error_types: `[${detection.nonRetryableErrorTypes.map((e) => JSON.stringify(e.value)).join(", ")}]`,
  });

  const worker = renderTemplate(snippetTemplate("python", "worker"), {
    executor_import: activityFunction.async ? "" : "from concurrent.futures import ThreadPoolExecutor",
    activity_module: activityModule,
    activity_function: activityFunction.name,
    workflow_class: workflowClass,
    task_queue: name,
    // Synchronous activities need a thread pool to run in; async ones don't.
    activity_executor: activityFunction.async ? "" : "activity_executor=ThreadPoolExecutor(max_workers=10),",
  });

  const starterInput = buildStarterInput(params, exampleInput, moduleNames);
  const starter = renderTemplate(snippetTemplate("python", "starter"), {
    starter_import:
      starterInput.imports.length > 0 ? `from ${activityModule} import ${starterInput.imports.join(", ")}` : "",
    workflow_class: workflowClass,
    task_queue: name,
    workflow_args: starterInput.arguments,
    workflow_id_prefix: name,
  });

  return [
    { tab: "install", language: "shell", content: snippetTemplate("python", "install").trim() },
    { tab: "activity", filename: `${activityModule}.py`, language: "python", content: code },
    { tab: "workflow", filename: "workflow.py", language: "python", content: workflow },
    { tab: "worker", filename: "worker.py", language: "python", content: worker },
    { tab: "starter", filename: "starter.py", language: "python", content: starter },
  ];
}

/** The call arguments after the function: `input,` for one, `args=[a, b],` for several, nothing for none. */
function argumentsFor(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `${values[0]},`;
  return `args=[${values.join(", ")}],`;
}

/**
 * Renders the example input as the starter's workflow argument. A single
 * parameter whose type the activity module defines (a dataclass, as in the
 * Temporal samples) becomes a constructor call with keyword arguments. Several
 * parameters take their values from the example input by parameter name.
 */
function buildStarterInput(
  params: InputType[],
  exampleInput: Record<string, unknown>,
  moduleNames: Set<string>,
): { imports: string[]; arguments: string } {
  if (params.length === 0) return { imports: [], arguments: "" };
  if (params.length === 1) {
    const type = unquote(params[0].type);
    if (moduleNames.has(type)) {
      return { imports: [type], arguments: `${constructorCall(type, exampleInput)},` };
    }
    const value = params[0].name in exampleInput ? exampleInput[params[0].name] : exampleInput;
    return { imports: [], arguments: `${toPythonLiteral(value)},` };
  }
  return { imports: [], arguments: argumentsFor(params.map((p) => toPythonLiteral(exampleInput[p.name]))) };
}

function constructorCall(type: string, fields: Record<string, unknown>): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) return `${type}()`;
  const lines = entries.map(([key, value]) => `    ${key}=${toPythonLiteral(value)},`);
  return [`${type}(`, ...lines, ")"].join("\n");
}

/** The function under `@activity.defn`, and whether it is `async def`. */
function findActivityFunction(code: string): { name: string; async: boolean } {
  const match = /@activity\.defn\b[\s\S]*?^[ \t]*(async[ \t]+)?def[ \t]+(\w+)/m.exec(code);
  if (!match) throw new Error("No function follows @activity.defn");
  return { name: match[2], async: Boolean(match[1]) };
}

/** Classes, functions and assignments at the top level of the module: the names it can export. */
function topLevelNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const match of code.matchAll(/^(?:class|def|async[ \t]+def)[ \t]+(\w+)/gm)) names.add(match[1]);
  for (const match of code.matchAll(/^(\w+)[ \t]*(?::[^=\n]*)?=(?!=)/gm)) names.add(match[1]);
  return names;
}

function identifiers(typeExpression: string): string[] {
  return [...typeExpression.matchAll(/[A-Za-z_]\w*/g)].map((m) => m[0]);
}

function unquote(type: string): string {
  return type.replace(/^(["'])(.*)\1$/, "$2");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
