import type { InputType } from "../../model/detection.js";
import type { Snippet } from "../../model/listing.js";
import { renderTemplate } from "./render-template.js";
import type { SnippetSource } from "./snippet-source.js";
import { snippetTemplate } from "./templates.js";

// The five TypeScript snippet tabs, generated from the templates in
// templates/typescript/ and the metadata stored with the listing, the way the
// Temporal TypeScript samples lay out a project. The activity tab is the stored
// code itself, saved as <listing-name>.ts. These are viewed, not run, in the PoC.

export function generateTypeScriptSnippets(source: SnippetSource): Snippet[] {
  const { name, code, detection, exampleInput } = source;
  // The TypeScript SDK names an activity after its exported function.
  const activityFunction = detection.activityName.value;
  const workflowFunction = `${activityFunction}Workflow`;
  const params = detection.inputTypes;
  const outputType = detection.outputType.value;
  const exported = exportedTypeNames(code);

  const annotationNames = [...params.map((p) => p.type), outputType].flatMap(identifiers);
  const moduleTypes = unique(annotationNames.filter((id) => exported.has(id)));

  const workflow = renderTemplate(snippetTemplate("typescript", "workflow"), {
    activity_module: name,
    type_import: moduleTypes.length > 0 ? `import type { ${moduleTypes.join(", ")} } from "./${name}";` : "",
    activity_function: activityFunction,
    non_retryable_error_types: `[${detection.nonRetryableErrorTypes.map((e) => JSON.stringify(e.value)).join(", ")}]`,
    workflow_function: workflowFunction,
    run_params: params.map((p) => `${p.name}: ${p.type}`).join(", "),
    output_type: outputType,
    activity_args: params.map((p) => p.name).join(", "),
  });

  const worker = renderTemplate(snippetTemplate("typescript", "worker"), {
    activity_module: name,
    task_queue: name,
  });

  const starter = renderTemplate(snippetTemplate("typescript", "starter"), {
    workflow_function: workflowFunction,
    task_queue: name,
    workflow_id_prefix: name,
    workflow_args: starterArgs(params, exampleInput, exported),
  });

  return [
    { tab: "install", language: "shell", content: snippetTemplate("typescript", "install").trim() },
    { tab: "activity", filename: `${name}.ts`, language: "typescript", content: code },
    { tab: "workflow", filename: "workflow.ts", language: "typescript", content: workflow },
    { tab: "worker", filename: "worker.ts", language: "typescript", content: worker },
    { tab: "starter", filename: "starter.ts", language: "typescript", content: starter },
  ];
}

/**
 * The starter's `args:` line. A single parameter whose type the activity file
 * exports (an interface, as in the Temporal samples) takes the whole example
 * input as an object literal. Otherwise each parameter takes the example
 * input's value under its own name.
 */
function starterArgs(params: InputType[], exampleInput: Record<string, unknown>, exported: Set<string>): string {
  if (params.length === 0) return "";
  if (params.length === 1) {
    const [param] = params;
    const value = !exported.has(param.type) && param.name in exampleInput ? exampleInput[param.name] : exampleInput;
    return ["args: [", ...indent(`${toTypeScriptLiteral(value)},`), "],"].join("\n");
  }
  return ["args: [", ...params.flatMap((p) => indent(`${toTypeScriptLiteral(exampleInput[p.name])},`)), "],"].join("\n");
}

/**
 * Renders an example input value as TypeScript source. Objects render one key
 * per line. Values are meant to be literals: strings, numbers, booleans and null.
 */
function toTypeScriptLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines = entries.map(([key, item]) => `${propertyKey(key)}: ${toTypeScriptLiteral(item)},`);
    return ["{", ...lines.flatMap(indent), "}"].join("\n");
  }
  return JSON.stringify(String(value));
}

function propertyKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function indent(text: string): string[] {
  return text.split("\n").map((line) => `  ${line}`);
}

/** Interfaces, type aliases, classes and enums the activity file exports: the types the workflow can import. */
function exportedTypeNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const match of code.matchAll(/^[ \t]*export[ \t]+(?:declare[ \t]+)?(?:abstract[ \t]+)?(?:interface|type|class|enum|const[ \t]+enum)[ \t]+(\w+)/gm)) {
    names.add(match[1]);
  }
  return names;
}

function identifiers(typeExpression: string): string[] {
  return [...typeExpression.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
