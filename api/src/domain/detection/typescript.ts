import type { Detection, InputType, Located } from "../../model/detection.js";
import type { Detector } from "./detector.js";
import {
  collapseWhitespace,
  findClosingBracket,
  LineIndex,
  maskSlashComments,
  splitTopLevel,
} from "./source-text.js";

// Regex detection for single-file TypeScript activities written against the
// Temporal TypeScript SDK (@temporalio/*). The TypeScript SDK names an
// activity after its exported function. Every result carries the 1-based line
// it was found on, so it can be linked as evidence.

const SDK_IMPORT = /^[ \t]*import\b(?:[^;'"]*?\bfrom)?\s*(["'])@temporalio\/[^"']*\1/m;
const ACTIVITY_FUNCTION = /^[ \t]*export[ \t]+async[ \t]+function[ \t]*(\w+)[ \t]*(?:<[^>(]*>)?[ \t]*\(/m;
const NON_RETRYABLE_CALL = /\bApplicationFailure\.nonRetryable\s*\(/g;
const CREATE_CALL = /\bApplicationFailure\.create\s*\(/g;
const NON_RETRYABLE_TRUE = /\bnonRetryable\s*:\s*true\b/;
const TYPE_OPTION = /\btype\s*:\s*(["'`])([^"'`]+)\1/;
const STRING_LITERAL = /^\s*(["'`])([^"'`]*)\1\s*$/;
const ENV_VAR_READS = [/\bprocess\.env\.([A-Za-z_]\w*)/g, /\bprocess\.env\s*\[\s*(["'])([^"']+)\1\s*\]/g];

export const typescriptDetector: Detector = {
  sdk: "typescript",
  recognises(code: string): boolean {
    return SDK_IMPORT.test(maskSlashComments(code));
  },
  detect(code: string): Detection {
    const source = maskSlashComments(code);
    const lines = new LineIndex(source);

    const sdkMatch = SDK_IMPORT.exec(source);
    if (!sdkMatch) throw new Error("No @temporalio import found");

    const fn = ACTIVITY_FUNCTION.exec(source);
    if (!fn) throw new Error("No exported async function found");
    const functionName = fn[1];
    const paramsOpen = fn.index + fn[0].length - 1;
    const paramsClose = findClosingBracket(source, paramsOpen);
    if (paramsClose === -1) throw new Error(`The parameters of ${functionName} are not closed`);

    return {
      sdk: { value: "typescript", line: lines.lineAt(sdkMatch.index + sdkMatch[0].search(/\S/)) },
      activityName: { value: functionName, line: lines.lineAt(fn.index + fn[0].indexOf(functionName)) },
      inputTypes: parseParameters(source.slice(paramsOpen + 1, paramsClose), paramsOpen + 1, lines),
      outputType: parseReturnType(source, paramsClose, lines),
      nonRetryableErrorTypes: findNonRetryableErrors(source, lines),
      envVars: findEnvVars(source, lines),
    };
  },
};

/** `name: Type` parameters. A parameter with no annotation is `unknown`, as TypeScript would infer it. */
function parseParameters(params: string, baseOffset: number, lines: LineIndex): InputType[] {
  const result: InputType[] = [];
  for (const { part, offset } of splitTopLevel(params, ",", { angles: true })) {
    const leading = part.length - part.trimStart().length;
    const text = part.trim();
    if (text === "") continue;
    const [declaration] = splitTopLevel(text, "=", { angles: true }).map((p) => p.part);
    const [name, ...typeParts] = splitTopLevel(declaration, ":", { angles: true }).map((p) => p.part);
    const type = typeParts.length > 0 ? collapseWhitespace(typeParts.join(":")) : "unknown";
    const bareName = collapseWhitespace(name).replace(/^\.\.\./, "").replace(/\?$/, "");
    result.push({ name: bareName, type, line: lines.lineAt(baseOffset + offset + leading) });
  }
  return result;
}

/** The return annotation, with `Promise<…>` unwrapped. No annotation gives `unknown`. */
function parseReturnType(source: string, paramsClose: number, lines: LineIndex): Located<string> {
  const colon = /^\s*:/.exec(source.slice(paramsClose + 1));
  if (!colon) return { value: "unknown", line: lines.lineAt(paramsClose) };
  const start = paramsClose + 1 + colon[0].length;
  // The annotation runs to the `{` that opens the body, outside any brackets.
  let depth = 0;
  let end = start;
  while (end < source.length) {
    const ch = source[end];
    if (ch === "{" && depth === 0) break;
    if (ch === "<" || ch === "(" || ch === "[" || ch === "{") depth++;
    else if ((ch === ">" && source[end - 1] !== "=") || ch === ")" || ch === "]" || ch === "}") depth--;
    end++;
  }
  const annotation = collapseWhitespace(source.slice(start, end));
  const promise = /^Promise\s*<([\s\S]*)>$/.exec(annotation);
  return {
    value: promise ? collapseWhitespace(promise[1]) : annotation,
    line: lines.lineAt(start + (source.slice(start).length - source.slice(start).trimStart().length)),
  };
}

function findNonRetryableErrors(source: string, lines: LineIndex): Located<string>[] {
  const found: Located<string>[] = [];
  const add = (type: string, offset: number) => {
    if (!found.some((f) => f.value === type)) found.push({ value: type, line: lines.lineAt(offset) });
  };
  const calls = [
    ...[...source.matchAll(NON_RETRYABLE_CALL)].map((m) => ({ kind: "nonRetryable" as const, match: m })),
    ...[...source.matchAll(CREATE_CALL)].map((m) => ({ kind: "create" as const, match: m })),
  ].sort((a, b) => a.match.index - b.match.index);

  for (const { kind, match } of calls) {
    const open = match.index + match[0].length - 1;
    const close = findClosingBracket(source, open);
    const args = source.slice(open + 1, close === -1 ? undefined : close);
    if (kind === "nonRetryable") {
      // ApplicationFailure.nonRetryable(message, type?, ...details)
      const typeArg = splitTopLevel(args, ",", { angles: true })[1]?.part;
      add(typeArg ? (STRING_LITERAL.exec(typeArg)?.[2] ?? "Error") : "Error", match.index);
    } else if (NON_RETRYABLE_TRUE.test(args)) {
      // ApplicationFailure.create({ ..., nonRetryable: true, type: "..." })
      add(TYPE_OPTION.exec(args)?.[2] ?? "Error", match.index);
    }
  }
  return found;
}

function findEnvVars(source: string, lines: LineIndex): Located<string>[] {
  const reads = ENV_VAR_READS.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((m) => ({ name: m[2] ?? m[1], offset: m.index })),
  ).sort((a, b) => a.offset - b.offset);
  const found: Located<string>[] = [];
  for (const read of reads) {
    if (!found.some((f) => f.value === read.name)) found.push({ value: read.name, line: lines.lineAt(read.offset) });
  }
  return found;
}
