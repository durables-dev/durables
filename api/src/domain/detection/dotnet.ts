import type { Detection, InputType, Located } from "../../model/detection.js";
import type { Detector } from "./detector.js";
import { collapseWhitespace, execFrom, findClosingBracket, LineIndex, maskSlashComments, splitTopLevel } from "./source-text.js";

// Regex detection for single-file C# activities written against the Temporal
// .NET SDK (Temporalio). The activity is the method under `[Activity]`. Its
// name is the attribute's explicit name if given, otherwise the method name
// with a trailing `Async` removed, as the .NET SDK names it. Every result
// carries the 1-based line it was found on, so it can be linked as evidence.

const SDK_USING = /^[ \t]*(?:global[ \t]+)?using[ \t]+(?:static[ \t]+)?Temporalio(?:\.\w+)*[ \t]*;/m;
const ACTIVITY_ATTRIBUTE = /\[[ \t]*Activity[ \t]*(?:\(\s*(?:"([^"]*)")?\s*\))?[ \t]*\]/;
/** The method declaration after the attribute: modifiers, return type and name, up to its `(`. */
const METHOD_HEAD = /\s*(?:\[[^\]]*\]\s*)*((?:(?:public|private|protected|internal|static|async|virtual|override|sealed|new|extern|unsafe)\s+)*)([\w.]+(?:\s*<[^()]*>)?\??)\s+(\w+)\s*\(/y;
const APPLICATION_FAILURE = /\bnew\s+ApplicationFailureException\s*\(/g;
const NON_RETRYABLE_TRUE = /\bnonRetryable\s*:\s*true\b/;
const ERROR_TYPE = /\berrorType\s*:\s*"([^"]+)"/;
const ENV_VAR_READS = /\bEnvironment\.GetEnvironmentVariable\s*\(\s*"([^"]+)"/g;
const PARAMETER_MODIFIERS = /^(?:(?:this|ref|out|in|params|scoped)\s+)+/;
const CLASS_DECLARATION = /\b(?<!record\s+)(?:class|struct)\s+(\w+)/g;

export const dotnetDetector: Detector = {
  sdk: "dotnet",
  recognises(code: string): boolean {
    return SDK_USING.test(maskSlashComments(code));
  },
  detect(code: string): Detection {
    const source = maskSlashComments(code);
    const lines = new LineIndex(source);

    const sdkMatch = SDK_USING.exec(source);
    if (!sdkMatch) throw new Error("No using Temporalio directive found");

    const method = findActivityMethod(source);
    if (!method) throw new Error("No method follows [Activity]");
    const paramsClose = findClosingBracket(source, method.paramsOpen);
    if (paramsClose === -1) throw new Error(`The parameters of ${method.name} are not closed`);

    const activityName: Located<string> =
      method.explicitName !== undefined
        ? { value: method.explicitName, line: lines.lineAt(method.attributeOffset) }
        : { value: method.name.replace(/(?<=.)Async$/, ""), line: lines.lineAt(method.nameOffset) };

    return {
      sdk: { value: "dotnet", line: lines.lineAt(sdkMatch.index + sdkMatch[0].search(/\S/)) },
      activityName,
      inputTypes: parseParameters(source.slice(method.paramsOpen + 1, paramsClose), method.paramsOpen + 1, lines),
      outputType: { value: unwrapTask(method.returnType), line: lines.lineAt(method.returnTypeOffset) },
      nonRetryableErrorTypes: findNonRetryableErrors(source, lines),
      envVars: findEnvVars(source, lines),
    };
  },
};

export type ActivityMethod = {
  /** The class (or struct) declaring the method, e.g. `ChargeActivities`. Undefined if there is none. */
  className?: string;
  /** The method name as written, e.g. `VoidChargeAsync`. */
  name: string;
  /** The name given in `[Activity("…")]`, if any. */
  explicitName?: string;
  returnType: string;
  isStatic: boolean;
  attributeOffset: number;
  nameOffset: number;
  returnTypeOffset: number;
  paramsOpen: number;
};

/**
 * The first method under an `[Activity]` attribute, and the class declaring it.
 * `source` should already have its comments masked (see `maskSlashComments`).
 */
export function findActivityMethod(source: string): ActivityMethod | null {
  let from = 0;
  for (;;) {
    const attribute = execFrom(ACTIVITY_ATTRIBUTE, source, from);
    if (!attribute) return null;
    const afterAttribute = attribute.index + attribute[0].length;
    METHOD_HEAD.lastIndex = afterAttribute;
    const head = METHOD_HEAD.exec(source);
    if (head) {
      const [whole, modifiers, returnType, name] = head;
      const nameOffset = afterAttribute + whole.lastIndexOf(name);
      const classes = [...source.slice(0, attribute.index).matchAll(CLASS_DECLARATION)];
      return {
        className: classes.at(-1)?.[1],
        name,
        explicitName: attribute[1],
        returnType: collapseWhitespace(returnType),
        isStatic: /\bstatic\b/.test(modifiers),
        attributeOffset: attribute.index,
        nameOffset,
        returnTypeOffset: afterAttribute + whole.indexOf(returnType, whole.indexOf(modifiers) + modifiers.length),
        paramsOpen: afterAttribute + whole.length - 1,
      };
    }
    from = afterAttribute;
  }
}

/** `Task<T>` and `ValueTask<T>` give `T`. A bare `Task`, `ValueTask` or `void` gives "void". */
export function unwrapTask(returnType: string): string {
  const type = collapseWhitespace(returnType);
  if (/^(?:System\.Threading\.Tasks\.)?(?:Value)?Task$/.test(type) || type === "void") return "void";
  const task = /^(?:System\.Threading\.Tasks\.)?(?:Value)?Task\s*<([\s\S]*)>$/.exec(type);
  return task ? collapseWhitespace(task[1]) : type;
}

/** `Type name` parameters, with modifiers (`this`, `ref`, …) and defaults dropped. */
function parseParameters(params: string, baseOffset: number, lines: LineIndex): InputType[] {
  const result: InputType[] = [];
  for (const { part, offset } of splitTopLevel(params, ",", { angles: true })) {
    const leading = part.length - part.trimStart().length;
    const [declaration] = splitTopLevel(part.trim(), "=", { angles: true }).map((p) => p.part);
    const text = collapseWhitespace(declaration.replace(/^\s*(?:\[[^\]]*\]\s*)*/, "")).replace(PARAMETER_MODIFIERS, "");
    if (text === "") continue;
    const space = text.lastIndexOf(" ");
    if (space === -1) continue;
    result.push({
      name: text.slice(space + 1),
      type: text.slice(0, space).replace(/\s*([<>,?\[\]])\s*/g, "$1").replace(/,/g, ", "),
      line: lines.lineAt(baseOffset + offset + leading),
    });
  }
  return result;
}

function findNonRetryableErrors(source: string, lines: LineIndex): Located<string>[] {
  const found: Located<string>[] = [];
  for (const match of source.matchAll(APPLICATION_FAILURE)) {
    const open = match.index + match[0].length - 1;
    const close = findClosingBracket(source, open);
    const args = source.slice(open + 1, close === -1 ? undefined : close);
    if (!NON_RETRYABLE_TRUE.test(args)) continue;
    const type = ERROR_TYPE.exec(args)?.[1] ?? "ApplicationFailureException";
    if (!found.some((f) => f.value === type)) found.push({ value: type, line: lines.lineAt(match.index) });
  }
  return found;
}

function findEnvVars(source: string, lines: LineIndex): Located<string>[] {
  const found: Located<string>[] = [];
  for (const match of source.matchAll(ENV_VAR_READS)) {
    if (!found.some((f) => f.value === match[1])) found.push({ value: match[1], line: lines.lineAt(match.index) });
  }
  return found;
}
