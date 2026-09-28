import type { InputType } from "../../model/detection.js";
import type { Snippet } from "../../model/listing.js";
import { toPascalCase } from "../addresses/names.js";
import { findActivityMethod } from "../detection/dotnet.js";
import { maskSlashComments } from "../detection/source-text.js";
import { renderTemplate } from "./render-template.js";
import type { SnippetSource } from "./snippet-source.js";
import { snippetTemplate } from "./templates.js";

// The five .NET snippet tabs, generated from the templates in templates/dotnet/
// and the metadata stored with the listing, the way the Temporal .NET samples
// write them. The activity tab is the stored code itself. The worker and the
// starter each have their own `Main` (WorkerProgram and StarterProgram), and
// their first line says how to pick one with StartupObject, so all five files
// fit in one project. These are viewed, not run, in the PoC.

const TYPE_DECLARATION = /\b(?:record(?:\s+(?:class|struct))?|class|struct)\s+(\w+)/g;
const NAMESPACE = /^[ \t]*namespace[ \t]+([\w.]+)/m;

export function generateDotnetSnippets(source: SnippetSource): Snippet[] {
  const { name, code, detection, exampleInput } = source;
  const pascalName = toPascalCase(detection.activityName.value);
  const workflowClass = `${pascalName}Workflow`;
  const method = activityMethod(code);
  const params = detection.inputTypes;
  const outputType = detection.outputType.value;
  const isVoid = outputType === "void";
  const namespace = NAMESPACE.exec(code)?.[1];
  const namespaceUsing = namespace ? `using ${namespace};` : "";
  const args = params.map((p) => p.name).join(", ");

  const workflow = renderTemplate(snippetTemplate("dotnet", "workflow"), {
    namespace_using: namespaceUsing,
    workflow_class: workflowClass,
    run_return_type: isVoid ? "Task" : `Task<${outputType}>`,
    run_params: params.map((p) => `${p.type} ${p.name}`).join(", "),
    await_keyword: isVoid ? "await" : "return await",
    activity_call: method.isStatic
      ? `() => ${method.className}.${method.name}(${args})`
      : `(${method.className} a) => a.${method.name}(${args})`,
    non_retryable_error_types:
      detection.nonRetryableErrorTypes.length > 0
        ? `new[] { ${detection.nonRetryableErrorTypes.map((e) => JSON.stringify(e.value)).join(", ")} }`
        : "Array.Empty<string>()",
  });

  const worker = renderTemplate(snippetTemplate("dotnet", "worker"), {
    namespace_using: namespaceUsing,
    task_queue: name,
    activities_instance: method.isStatic ? "" : `var activities = new ${method.className}();`,
    activity_reference: method.isStatic ? `${method.className}.${method.name}` : `activities.${method.name}`,
    workflow_class: workflowClass,
  });

  const starter = renderTemplate(snippetTemplate("dotnet", "starter"), {
    namespace_using: namespaceUsing,
    task_queue: name,
    result_assignment: isVoid ? "" : "var result = ",
    workflow_class: workflowClass,
    workflow_args: starterArgs(params, exampleInput, declaredTypes(code)),
    workflow_id_prefix: name,
    result_output: isVoid ? `Console.WriteLine("Workflow completed.");` : `Console.WriteLine($"Workflow result: {result}");`,
  });

  return [
    { tab: "install", language: "shell", content: snippetTemplate("dotnet", "install").trim() },
    { tab: "activity", filename: `${pascalName}.cs`, language: "csharp", content: code },
    { tab: "workflow", filename: `${workflowClass}.cs`, language: "csharp", content: workflow },
    { tab: "worker", filename: "Worker.cs", language: "csharp", content: worker },
    { tab: "starter", filename: "Starter.cs", language: "csharp", content: starter },
  ];
}

/**
 * The workflow's argument list in the starter. A single parameter whose type
 * the activity file declares (a record, as in the Temporal samples) becomes a
 * constructor call with named arguments, one per example input key, as written.
 * Otherwise each parameter takes the example input's value under its own name.
 */
function starterArgs(params: InputType[], exampleInput: Record<string, unknown>, declared: Set<string>): string {
  if (params.length === 1 && declared.has(params[0].type)) {
    const named = Object.entries(exampleInput).map(([key, value]) => `${key}: ${toCSharpLiteral(value)}`);
    return `new ${params[0].type}(${named.join(", ")})`;
  }
  return params.map((p) => toCSharpLiteral(exampleInput[p.name])).join(", ");
}

/**
 * Renders an example input value as a C# literal. Only strings, numbers,
 * booleans and null render; a nested object or array becomes `default`.
 */
// POC-SHORTCUT: SC-010
function toCSharpLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "default";
  // JSON string escapes (\", \\, \n, \uXXXX) are valid in a C# regular string literal.
  if (typeof value === "string") return JSON.stringify(value);
  return "default /* nested example values aren't rendered */";
}

/** The class declaring the `[Activity]` method, the method's name as written, and whether it is static. */
function activityMethod(code: string): { className: string; name: string; isStatic: boolean } {
  const method = findActivityMethod(maskSlashComments(code));
  if (!method) throw new Error("No method follows [Activity]");
  if (!method.className) throw new Error("The [Activity] method is not inside a class");
  return { className: method.className, name: method.name, isStatic: method.isStatic };
}

/** Records, classes and structs the activity file declares: the types the starter can construct. */
function declaredTypes(code: string): Set<string> {
  return new Set([...code.matchAll(TYPE_DECLARATION)].map((m) => m[1]));
}
