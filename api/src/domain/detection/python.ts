import type { Detection, Field, InputType, Located, TypeFields } from "../../model/detection.js";
import type { Detector } from "./detector.js";
import { collapseWhitespace as collapse, execFrom, findClosingBracket, LineIndex, skipString, splitTopLevel } from "./source-text.js";

// Regex detection for single-file Python activities written against the
// Temporal Python SDK (temporalio). Every result carries the 1-based line it
// was found on, so it can be linked as evidence later.

const SDK_IMPORT = /^[ \t]*(?:from[ \t]+temporalio(?:\.\w+)*[ \t]+import\b|import[ \t]+temporalio\b)/m;
const ACTIVITY_DECORATOR = /^[ \t]*@activity\.defn\b/m;
const DECORATOR_NAME = /\bname\s*=\s*(["'])([^"']+)\1/;
const FUNCTION_DEF = /^[ \t]*(?:async[ \t]+)?def[ \t]+(\w+)[ \t]*\(/m;
const RETURN_ANNOTATION = /^\s*->\s*([^:]+?)\s*:/;
const APPLICATION_ERROR = /\bApplicationError\s*\(/g;
const NON_RETRYABLE_TRUE = /\bnon_retryable\s*=\s*True\b/;
const ERROR_TYPE = /\btype\s*=\s*(["'])([^"']+)\1/;
const ENV_VAR_READS = [
  /\bos\.environ\s*\[\s*(["'])([^"']+)\1\s*\]/g,
  /\bos\.environ\.get\s*\(\s*(["'])([^"']+)\1/g,
  /\bos\.getenv\s*\(\s*(["'])([^"']+)\1/g,
];
const SKIPPED_PARAMETERS = new Set(["self", "cls", "*", "/"]);
const CLASS_STATEMENT = /^([ \t]*)class[ \t]+(\w+)\b[^\n]*:[ \t\r]*$/gm;
const DATACLASS_DECORATOR = /^[ \t]*@(?:dataclasses\.)?dataclass\b/;
const FIELD_LINE = /^(\w+)[ \t]*:(.*)$/;

export const pythonDetector: Detector = {
  sdk: "python",
  recognises(code: string): boolean {
    return SDK_IMPORT.test(maskComments(code));
  },
  detect(code: string): Detection {
    const source = maskComments(code);
    const lines = new LineIndex(source);

    const sdkMatch = SDK_IMPORT.exec(source);
    if (!sdkMatch) throw new Error("No temporalio import found");

    const decorator = execFrom(ACTIVITY_DECORATOR, source, 0);
    if (!decorator) throw new Error("No @activity.defn found");
    let afterDecorator = decorator.index + decorator[0].length;
    let decoratorArgs = "";
    let decoratorArgsOffset = afterDecorator;
    const decoratorParen = /^\s*\(/.exec(source.slice(afterDecorator));
    if (decoratorParen) {
      const open = afterDecorator + decoratorParen[0].length - 1;
      const close = findClosingBracket(source, open);
      decoratorArgs = source.slice(open + 1, close);
      decoratorArgsOffset = open + 1;
      afterDecorator = close + 1;
    }

    const def = execFrom(FUNCTION_DEF, source, afterDecorator);
    if (!def) throw new Error("No function follows @activity.defn");
    const functionName = def[1];
    const paramsOpen = def.index + def[0].length - 1;
    const paramsClose = findClosingBracket(source, paramsOpen);

    const explicitName = DECORATOR_NAME.exec(decoratorArgs);
    const activityName: Located<string> = explicitName
      ? { value: explicitName[2], line: lines.lineAt(decoratorArgsOffset + explicitName.index) }
      : { value: functionName, line: lines.lineAt(def.index + def[0].indexOf(functionName)) };

    const dataclasses = findDataclasses(source, lines);
    const inputTypes = parseParameters(source.slice(paramsOpen + 1, paramsClose), paramsOpen + 1, lines).map(
      (input) => ({ ...input, ...fieldsOf(input.type, dataclasses) }),
    );

    const returns = RETURN_ANNOTATION.exec(source.slice(paramsClose + 1));
    const outputValue = returns ? collapse(returns[1]) : "Any";
    const outputType: Located<string> & TypeFields = {
      value: outputValue,
      line: returns ? lines.lineAt(paramsClose + 1 + returns[0].indexOf("->")) : lines.lineAt(def.index),
      ...fieldsOf(outputValue, dataclasses),
    };

    return {
      sdk: { value: "python", line: lines.lineAt(sdkMatch.index) },
      activityName,
      inputTypes,
      outputType,
      nonRetryableErrorTypes: findNonRetryableErrors(source, lines),
      envVars: findEnvVars(source, lines),
    };
  },
};

function parseParameters(params: string, baseOffset: number, lines: LineIndex): InputType[] {
  const result: InputType[] = [];
  for (const { part, offset } of splitTopLevel(params)) {
    const leading = part.length - part.trimStart().length;
    const text = part.trim();
    if (text === "" || text.startsWith("*") || SKIPPED_PARAMETERS.has(text)) continue;
    const [declaration] = splitTopLevel(text, "=").map((p) => p.part);
    const colon = declaration.indexOf(":");
    const name = (colon === -1 ? declaration : declaration.slice(0, colon)).trim();
    if (SKIPPED_PARAMETERS.has(name)) continue;
    const type = colon === -1 ? "Any" : collapse(declaration.slice(colon + 1));
    result.push({ name, type, line: lines.lineAt(baseOffset + offset + leading) });
  }
  return result;
}

/**
 * The same-file `@dataclass` classes, by name, with their top-level
 * `name: type` lines in order. Regex-level only: a class header or annotation
 * spread over several lines is not followed, and a field whose type is itself a
 * dataclass is listed by its type name, without that class's own fields.
 * Imported types get no fields, and the TypeScript and .NET detectors list
 * none at all, so for them version comparison sees type names only.
 */
// POC-SHORTCUT: SC-019
function findDataclasses(source: string, lines: LineIndex): Map<string, Required<TypeFields>> {
  const sourceLines = source.split("\n");
  const found = new Map<string, Required<TypeFields>>();
  for (const match of source.matchAll(CLASS_STATEMENT)) {
    const classLine = lines.lineAt(match.index);
    const classIndent = match[1].length;
    if (!isDataclass(sourceLines, classLine, classIndent)) continue;
    found.set(match[2], { fields: classFields(source, match.index + match[0].length, classIndent, lines), typeLine: classLine });
  }
  return found;
}

/** Whether a decorator line directly above the class (at its indent) is `@dataclass` or `@dataclasses.dataclass`. */
function isDataclass(sourceLines: string[], classLine: number, classIndent: number): boolean {
  for (let index = classLine - 2; index >= 0; index--) {
    const text = sourceLines[index];
    if (text.trim() === "") continue;
    if (indentOf(text) !== classIndent || !text.trimStart().startsWith("@")) return false;
    if (DATACLASS_DECORATOR.test(text)) return true;
  }
  return false;
}

/** The class body's top-level `name: type` lines, in order, from just past the class statement's colon. */
function classFields(source: string, bodyStart: number, classIndent: number, lines: LineIndex): Field[] {
  const fields: Field[] = [];
  let bodyIndent = -1;
  let offset = source.indexOf("\n", bodyStart);
  while (offset !== -1 && offset < source.length) {
    const lineStart = offset + 1;
    const lineEnd = source.indexOf("\n", lineStart);
    const text = source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    offset = lineEnd;
    if (text.trim() === "") continue;
    const indent = indentOf(text);
    if (indent <= classIndent) break;
    if (bodyIndent === -1) bodyIndent = indent;
    if (indent !== bodyIndent) continue;
    const content = text.slice(indent);
    if (content[0] === '"' || content[0] === "'") {
      // A docstring or other bare string: skip past its end, which may be lines further on.
      const end = skipString(source, lineStart + indent);
      offset = source.indexOf("\n", end);
      continue;
    }
    const field = FIELD_LINE.exec(content.trimEnd());
    if (!field) continue;
    const [annotation] = splitTopLevel(field[2], "=").map((part) => part.part);
    fields.push({ name: field[1], type: collapse(annotation), line: lines.lineAt(lineStart) });
  }
  return fields;
}

function fieldsOf(type: string, dataclasses: Map<string, Required<TypeFields>>): TypeFields {
  const found = dataclasses.get(type);
  return found ? { fields: found.fields, typeLine: found.typeLine } : {};
}

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

function findNonRetryableErrors(source: string, lines: LineIndex): Located<string>[] {
  const found: Located<string>[] = [];
  for (const match of source.matchAll(APPLICATION_ERROR)) {
    const open = match.index + match[0].length - 1;
    const close = findClosingBracket(source, open);
    const args = source.slice(open + 1, close === -1 ? undefined : close);
    if (!NON_RETRYABLE_TRUE.test(args)) continue;
    const type = ERROR_TYPE.exec(args)?.[2] ?? "ApplicationError";
    if (!found.some((f) => f.value === type)) {
      found.push({ value: type, line: lines.lineAt(match.index) });
    }
  }
  return found;
}

function findEnvVars(source: string, lines: LineIndex): Located<string>[] {
  const reads = ENV_VAR_READS.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((m) => ({ name: m[2], offset: m.index })),
  ).sort((a, b) => a.offset - b.offset);
  const found: Located<string>[] = [];
  for (const read of reads) {
    if (!found.some((f) => f.value === read.name)) {
      found.push({ value: read.name, line: lines.lineAt(read.offset) });
    }
  }
  return found;
}

/** Blanks out `#` comments (outside string literals) so commented-out code is not detected. Keeps offsets. */
function maskComments(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      const end = skipString(code, i);
      out += code.slice(i, end);
      i = end;
    } else if (ch === "#") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
