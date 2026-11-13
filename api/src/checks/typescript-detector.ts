import type { Detector } from "./detector";
import type { ActivityFacts, LineRef, NamedLineRef } from "./facts";
import type { SdkRecognition } from "./identify";
import { isNodeBuiltin } from "./node-builtins";
import type { Pattern } from "./pattern";
import {
  allMatches,
  enclosingBrackets,
  firstByName,
  isInside,
  type LineOf,
  lineFinder,
  type Span,
} from "./scan";
import type { Source } from "./source";

// TypeScript detection (ADR 0008). Every pattern below is part of the published rubric. A
// match only counts when it starts in code: a pattern that starts inside a comment or a string
// literal is ignored, so commented-out code and examples inside strings are never detected.
// The parts of a template literal inside ${…} are code.
//
// A TypeScript activity is an exported async function with at least one typed parameter and a
// Promise<…> return type. It is exported as a function, as a constant holding an async arrow
// function or function expression, or as a member of an exported object.

/** An import or re-export from a Temporal TypeScript SDK package, such as `@temporalio/activity`. */
export const typescriptSdkImport: Pattern = {
  name: "typescript-sdk-import",
  description:
    'An import or re-export from one of the Temporal TypeScript SDK\'s @temporalio packages, such as import { heartbeat } from "@temporalio/activity".',
  regex:
    /(?:^|;)[ \t]*(?:import|export)(?:\s+type\b)?\s*(?:[A-Za-z_$][\w$]*\s*(?:,\s*)?)?(?:\{[^{}]*\}\s*|\*\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?)?(?:from\s*)?["']@temporalio\/[\w.~-]+/m,
};

/**
 * An exported async function declaration, up to the opening parenthesis of its parameters, such
 * as `export async function greet(`. Group 1 is the name.
 */
export const typescriptExportedAsyncFunction: Pattern = {
  name: "typescript-exported-async-function",
  description:
    "An exported async function declaration, such as export async function greet( or export default async function greet(, optionally with type parameters before its parameters.",
  regex:
    /(?<![\w$.])export\s+(?:default\s+)?async\s+function\s+([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>\s*)?\(/,
};

/**
 * An exported constant holding an async arrow function or async function expression, up to the
 * opening parenthesis of its parameters, such as `export const greet = async (`. Group 1 is the
 * name.
 */
export const typescriptExportedAsyncArrow: Pattern = {
  name: "typescript-exported-async-arrow",
  description:
    "An exported constant, let or var holding an async arrow function or async function expression, such as export const greet = async ( or export const greet = async function (.",
  regex:
    /(?<![\w$.])export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+?)?=\s*async\s*(?:function\b\s*(?:[A-Za-z_$][\w$]*)?\s*)?(?:<[^<>()]*>\s*)?\(/,
};

/**
 * An exported object literal, up to its opening brace, such as `export const activities = {` or
 * `export default {`. Its async members are read as activities.
 */
export const typescriptExportedObject: Pattern = {
  name: "typescript-exported-object",
  description:
    "An exported object literal, such as export const activities = { or export default {. Its own async methods and async function properties are activities.",
  regex:
    /(?<![\w$.])export\s+(?:(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=;\n]+?)?=|default)\s*\{/,
};

/**
 * An async method in an object literal, up to the opening parenthesis of its parameters, such
 * as `async greet(`. Group 1 is the name. It counts only directly inside an exported object.
 */
export const typescriptObjectAsyncMethod: Pattern = {
  name: "typescript-object-async-method",
  description:
    "An async method written directly inside an exported object, such as async greet(input: Name): Promise<string> { … }.",
  regex:
    /(?<![\w$.])async\s+(?!function\b)([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>\s*)?\(/,
};

/**
 * An object property holding an async arrow function or function expression, up to the opening
 * parenthesis of its parameters, such as `greet: async (`. Group 1 is the name. It counts only
 * directly inside an exported object.
 */
export const typescriptObjectAsyncProperty: Pattern = {
  name: "typescript-object-async-property",
  description:
    "A property of an exported object holding an async arrow function or async function expression, such as greet: async (input: Name): Promise<string> => { … }.",
  regex:
    /(?<![\w$.])([A-Za-z_$][\w$]*)\s*:\s*async\s*(?:function\b\s*(?:[A-Za-z_$][\w$]*)?\s*)?(?:<[^<>()]*>\s*)?\(/,
};

/**
 * A Promise return type, read from just after a parameter list's closing parenthesis, up to
 * the `<` that opens the promised type.
 */
export const typescriptPromiseReturn: Pattern = {
  name: "typescript-promise-return",
  description:
    "A Promise<…> return type straight after the parameters, such as ): Promise<MessageRef>. The output type is the type inside the angle brackets.",
  regex: /^\s*:\s*Promise\s*</,
};

/**
 * One parameter with a type annotation, such as `input: SlackMessage`, `{ id }: Request` or
 * `options?: Options = {}`. Group 1 is the name or destructuring pattern, group 2 the type.
 */
export const typescriptTypedParameter: Pattern = {
  name: "typescript-typed-parameter",
  description:
    "A function parameter with a type annotation, such as input: SlackMessage, options?: Options or { id }: Request, optionally followed by a default value.",
  regex:
    /^(?:\.\.\.)?\s*([A-Za-z_$][\w$]*|\{[\s\S]*\}|\[[\s\S]*\])\s*(?:\?\s*)?:\s*([\s\S]*?\S)\s*(?:=(?!>)[\s\S]*)?$/,
};

/**
 * A type that reads as a type name: a name or dotted name, optionally with type arguments,
 * array brackets or `|` unions.
 */
export const typescriptTypeName: Pattern = {
  name: "typescript-type-name",
  description:
    "A type that can be shown as a type name, such as SlackMessage, models.SlackMessage, string[], Record<string, number> or MessageRef | undefined. Anything else, such as an inline object type, is shown as unknown.",
  regex:
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:<[\w$., <>[\]|]*>)?(?:\[\])*(?:[ \t]*\|[ \t]*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:<[\w$., <>[\]|]*>)?(?:\[\])*)*$/,
};

/** A non-retryable application failure made with the factory, such as `ApplicationFailure.nonRetryable(`. */
export const typescriptNonRetryableFactory: Pattern = {
  name: "typescript-non-retryable-factory",
  description:
    "A call to the SDK's ApplicationFailure.nonRetryable(…), which makes a non-retryable failure. The line reported is the line of nonRetryable.",
  regex: /(?<![\w$])ApplicationFailure\s*\.\s*nonRetryable\s*\(/,
};

/**
 * A call to `ApplicationFailure.create` with an object argument, up to its opening brace. It
 * counts when `typescriptNonRetryableOption` is one of that object's own properties.
 */
export const typescriptApplicationFailureCreate: Pattern = {
  name: "typescript-application-failure-create",
  description:
    "A call to the SDK's ApplicationFailure.create({ … }) with nonRetryable: true among the options object's own properties. The line reported is the line of nonRetryable: true.",
  regex: /(?<![\w$])ApplicationFailure\s*\.\s*create\s*\(\s*\{/,
};

/** The `nonRetryable: true` option, as read inside `ApplicationFailure.create({ … })`. */
export const typescriptNonRetryableOption: Pattern = {
  name: "typescript-non-retryable-option",
  description:
    "The option nonRetryable: true. It marks a failure as non-retryable only when it is a property of the options object passed to ApplicationFailure.create itself.",
  regex: /(?<![\w$.])nonRetryable\s*:\s*true\b/,
};

/**
 * A construction of the SDK's application failure, up to the opening parenthesis of its
 * arguments. It counts when its third argument is `true`, the non-retryable flag.
 */
export const typescriptApplicationFailureConstructor: Pattern = {
  name: "typescript-application-failure-constructor",
  description:
    "A new ApplicationFailure(message, type, true, …) whose third argument, nonRetryable, is true. The line reported is the line of that true.",
  regex:
    /(?<![\w$.])new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*ApplicationFailure\s*\(/,
};

/** An environment variable read by name. Group 1, or group 3, is the variable's name. */
export const typescriptEnvironmentRead: Pattern = {
  name: "typescript-environment-read",
  description:
    'An environment variable read by name: process.env.NAME or process.env["NAME"], with single, double or back quotes, and optional chaining.',
  regex:
    /(?<![\w$.])process\s*\.\s*env\s*(?:\??\.\s*([A-Za-z_$][\w$]*)|(?:\?\.\s*)?\[\s*(["'`])([A-Za-z_$][\w$]*)\2\s*\])/,
};

/**
 * A static `import … from` or `export … from` statement, including `import type`. Group 2 is
 * the module specifier. Dynamic `import()` and `require()` do not match.
 */
export const typescriptImportFrom: Pattern = {
  name: "typescript-import-from",
  description:
    'A static import or re-export from a module, such as import { WebClient } from "@slack/web-api", import type { Stripe } from "stripe" or export * from "./types". Dynamic import() and require() are not counted.',
  regex:
    /(?:^|;)[ \t]*(?:import|export)(?:\s+type\b)?\s*(?:[A-Za-z_$][\w$]*\s*(?:,\s*)?)?(?:\{[^{}]*\}\s*|\*\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?)?from\s*(["'])([^"'\n]+)\1/m,
};

/** A side-effect import, such as `import "dotenv/config"`. Group 2 is the module specifier. */
export const typescriptSideEffectImport: Pattern = {
  name: "typescript-side-effect-import",
  description:
    'An import for its side effects only, such as import "dotenv/config".',
  regex: /(?:^|;)[ \t]*import\s*(["'])([^"'\n]+)\1/m,
};

/**
 * A module specifier that names an npm package. Group 1 is the package: `@scope/name` for a
 * scoped package, otherwise the first part of the path.
 */
export const typescriptPackageSpecifier: Pattern = {
  name: "typescript-package-specifier",
  description:
    "A module specifier that names a package, such as stripe, lodash/merge or @slack/web-api/dist. A scoped package is its scope and name, and a subpath belongs to its package. Relative paths such as ./types, node: built-ins and URLs are not packages.",
  regex: /^(@[a-z0-9][\w.~-]*\/[a-z0-9][\w.~-]*|[a-z0-9][\w.~-]*)(?:\/.*)?$/,
};

/** A heartbeat call, such as `heartbeat()` or `Context.current().heartbeat(details)`. */
export const typescriptHeartbeatCall: Pattern = {
  name: "typescript-heartbeat-call",
  description:
    "A call to the SDK's heartbeat, with or without details, such as heartbeat() or Context.current().heartbeat(progress). A function declared with the name heartbeat is not a call.",
  regex: /(?<![\w$])(?<!function\s+)heartbeat\s*\(/,
};

/**
 * A comment or a string literal. Matches that start inside one are ignored. An unterminated
 * string runs to the end of its line, and an unterminated template literal or block comment to
 * the end of the file.
 */
export const typescriptCommentOrString: Pattern = {
  name: "typescript-comment-or-string",
  description:
    "A comment or a string literal: // and /* */ comments, single- and double-quoted strings and template literals. Nothing that starts inside one is detected, so commented-out code and examples inside strings are ignored. The parts of a template literal inside ${…} are code and are detected.",
  regex:
    /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?|`(?:[^`\\]|\\[\s\S])*`?/,
};

/** Every TypeScript pattern, as published in the rubric. */
export const typescriptPatterns: readonly Pattern[] = [
  typescriptSdkImport,
  typescriptExportedAsyncFunction,
  typescriptExportedAsyncArrow,
  typescriptExportedObject,
  typescriptObjectAsyncMethod,
  typescriptObjectAsyncProperty,
  typescriptPromiseReturn,
  typescriptTypedParameter,
  typescriptTypeName,
  typescriptNonRetryableFactory,
  typescriptApplicationFailureCreate,
  typescriptNonRetryableOption,
  typescriptApplicationFailureConstructor,
  typescriptEnvironmentRead,
  typescriptImportFrom,
  typescriptSideEffectImport,
  typescriptPackageSpecifier,
  typescriptHeartbeatCall,
  typescriptCommentOrString,
];

/** The scope of the Temporal SDK's own packages, which Dependencies leaves out. */
const temporalSdkScope = "@temporalio/";

/**
 * The longest parameter list, argument list or promised type read, in characters. Anything
 * longer is not read, so no pasted file can make detection slow.
 */
const longestReadable = 2000;

/**
 * The braced `${…}` fields of a template literal, as offsets into the literal. Brackets and
 * strings inside a field are skipped over, so a field ends at its own closing brace.
 */
const templateFields = (literal: string): Span[] => {
  const end =
    literal.length > 1 && literal.endsWith("`")
      ? literal.length - 1
      : literal.length;
  const fields: Span[] = [];
  let i = 1;
  while (i < end) {
    const character = literal[i];
    if (character === "\\") {
      i += 2;
      continue;
    }
    if (character !== "$" || literal[i + 1] !== "{") {
      i++;
      continue;
    }
    const fieldStart = i;
    i++;
    let depth = 0;
    while (i < end) {
      const inner = literal[i] ?? "";
      if (inner === "'" || inner === '"') {
        const close = literal.indexOf(inner, i + 1);
        i = close === -1 || close >= end ? end : close + 1;
        continue;
      }
      if ("([{".includes(inner)) {
        depth++;
      } else if (")]}".includes(inner)) {
        depth--;
      }
      i++;
      if (depth === 0) {
        break;
      }
    }
    fields.push({ start: fieldStart, end: i });
  }
  return fields;
};

/**
 * The spans of the text that are comments or strings, in order. A template literal's `${…}`
 * fields are left out, so the code inside them is read like any other code.
 */
const ignoredSpans = (text: string): Span[] =>
  allMatches(typescriptCommentOrString, text).flatMap((match) => {
    const start = match.index;
    const literal = match[0];
    if (!literal.startsWith("`")) {
      return [{ start, end: start + literal.length }];
    }
    const spans: Span[] = [];
    let from = 0;
    for (const field of templateFields(literal)) {
      spans.push({ start: start + from, end: start + field.start });
      from = field.end;
    }
    spans.push({ start: start + from, end: start + literal.length });
    return spans.filter((span) => span.end > span.start);
  });

/** The index of the first span that ends after `offset`, in spans that are in order. */
const firstSpanAfter = (spans: readonly Span[], offset: number) => {
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((spans[middle]?.end ?? 0) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

/** Code read from the text, and the offset its first non-blank character sits at. */
interface Piece {
  readonly text: string;
  readonly offset: number;
}

/**
 * Splits the code between `start` and `end` on its top-level commas. Round, square, curly and
 * angle brackets nest; the `>` of an arrow `=>` doesn't close anything. Comments are left out,
 * and commas inside strings don't split. Empty pieces are left out.
 */
const splitTopLevel = (
  text: string,
  ignored: readonly Span[],
  start: number,
  end: number,
): Piece[] => {
  const pieces: Piece[] = [];
  let depth = 0;
  let current = "";
  let offset = -1;
  let next = firstSpanAfter(ignored, start);
  const finish = () => {
    const trimmed = current.trim();
    if (trimmed !== "") {
      pieces.push({ text: trimmed, offset });
    }
    current = "";
    offset = -1;
  };
  for (let i = start; i < end; i++) {
    const span = ignored[next];
    if (span !== undefined && span.start < end && i >= span.start) {
      const isComment = text[span.start] === "/";
      if (!isComment) {
        if (offset === -1) {
          offset = span.start;
        }
        current += text.slice(span.start, Math.min(span.end, end));
      }
      i = span.end - 1;
      next++;
      continue;
    }
    const character = text[i] ?? "";
    if ("([{<".includes(character)) {
      depth++;
    } else if (")]}".includes(character)) {
      depth--;
    } else if (character === ">" && text[i - 1] !== "=") {
      depth--;
    }
    if (character === "," && depth === 0) {
      finish();
      continue;
    }
    if (offset === -1 && character.trim() !== "") {
      offset = i;
    }
    current += character;
  }
  finish();
  return pieces;
};

/**
 * For each offset of an open bracket, the offset of the bracket that closes it, or -1. Built in
 * one pass from `enclosingBrackets`, where a closing bracket is enclosed by the one it closes.
 */
const closingBrackets = (text: string, enclosing: Int32Array) => {
  const closing = new Int32Array(text.length).fill(-1);
  for (let i = 0; i < text.length; i++) {
    const open = enclosing[i] ?? -1;
    if (open !== -1 && ")]}".includes(text[i] ?? "")) {
      closing[open] = i;
    }
  }
  return closing;
};

/**
 * The offset of the bracket that closes the open bracket at `open`. -1 when it is never closed,
 * or when what it encloses is too long to read.
 */
const readableClose = (closing: Int32Array, open: number) => {
  const close = closing[open] ?? -1;
  return close - open > longestReadable ? -1 : close;
};

/**
 * The offset of the `>` that closes the `<` at `open`, skipping comments and strings. -1 when it
 * isn't closed within the readable length.
 */
const closingAngle = (text: string, ignored: readonly Span[], open: number) => {
  let depth = 0;
  let next = firstSpanAfter(ignored, open);
  const end = Math.min(text.length, open + longestReadable);
  for (let i = open; i < end; i++) {
    const span = ignored[next];
    if (span !== undefined && i >= span.start) {
      i = span.end - 1;
      next++;
      continue;
    }
    const character = text[i];
    if (character === "<") {
      depth++;
    } else if (character === ">" && text[i - 1] !== "=") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
};

/** The type name a type reads as, or null when it can't be read. */
const typeName = (type: string) => {
  const trimmed = type.trim();
  return typescriptTypeName.regex.test(trimmed) ? trimmed : null;
};

type ActivitySignature = Pick<
  ActivityFacts,
  "activity" | "input" | "output" | "runsAs"
>;

/** What the detector reads once per file, to share between its steps. */
interface Reading {
  readonly text: string;
  readonly ignored: readonly Span[];
  readonly enclosing: Int32Array;
  readonly closing: Int32Array;
  readonly lineOf: LineOf;
}

/**
 * Reads an async function's signature from the parenthesis that opens its parameters. Null
 * unless it has at least one typed parameter and a Promise<…> return type.
 */
const readActivity = (
  reading: Reading,
  name: string,
  nameOffset: number,
  openParenthesis: number,
): ActivitySignature | null => {
  const { text, ignored, closing, lineOf } = reading;
  const closeParenthesis = readableClose(closing, openParenthesis);
  if (closeParenthesis === -1) {
    return null;
  }
  const parameters = splitTopLevel(
    text,
    ignored,
    openParenthesis + 1,
    closeParenthesis,
  ).flatMap((piece) => {
    const found = typescriptTypedParameter.regex.exec(piece.text);
    // `this` declares the function's receiver. It is not an input.
    return found?.[1] === "this" ? [] : [{ typed: found?.[2] }];
  });
  const typed = parameters.flatMap(({ typed }) =>
    typed === undefined ? [] : [typed],
  );
  const promise = typescriptPromiseReturn.regex.exec(
    text.slice(closeParenthesis + 1, closeParenthesis + 1 + longestReadable),
  );
  if (typed.length === 0 || promise === null) {
    return null;
  }
  const openAngle = closeParenthesis + promise[0].length;
  const closeAngle = closingAngle(text, ignored, openAngle);
  const [onlyInput] = typed;
  return {
    activity: { name, line: lineOf(nameOffset) },
    input:
      parameters.length === 1 && onlyInput !== undefined
        ? typeName(onlyInput)
        : null,
    output:
      closeAngle === -1
        ? null
        : typeName(text.slice(openAngle + 1, closeAngle)),
    runsAs: "async",
  };
};

/** Each third-party package imported, with the line of its first import. */
const readDependencies = (
  text: string,
  lineOf: LineOf,
  inCode: (match: RegExpExecArray) => boolean,
): NamedLineRef[] => {
  const imported = [typescriptImportFrom, typescriptSideEffectImport].flatMap(
    (pattern) =>
      allMatches(pattern, text)
        .filter(inCode)
        .flatMap((match) => {
          const name = typescriptPackageSpecifier.regex.exec(
            match[2] ?? "",
          )?.[1];
          return name === undefined ? [] : [{ name, offset: match.index }];
        }),
  );
  const thirdParty = imported
    .filter(
      ({ name }) => !name.startsWith(temporalSdkScope) && !isNodeBuiltin(name),
    )
    .sort((a, b) => a.offset - b.offset)
    .map(({ name, offset }) => ({ name, line: lineOf(offset) }));
  return firstByName(thirdParty);
};

/** Each place a non-retryable application failure is made, in order. */
const readNonRetryableErrors = (
  reading: Reading,
  found: (pattern: Pattern) => RegExpExecArray[],
): LineRef[] => {
  const { text, ignored, enclosing, closing, lineOf } = reading;
  const fromFactory = found(typescriptNonRetryableFactory).map(
    (match) => match.index + match[0].lastIndexOf("nonRetryable"),
  );

  // The first nonRetryable: true directly inside each open brace, by the brace's offset.
  const options = new Map<number, number>();
  for (const match of found(typescriptNonRetryableOption).reverse()) {
    options.set(enclosing[match.index] ?? -1, match.index);
  }
  const fromCreate = found(typescriptApplicationFailureCreate).flatMap(
    (match) => {
      const option = options.get(match.index + match[0].length - 1);
      return option === undefined ? [] : [option];
    },
  );

  const fromConstructor = found(
    typescriptApplicationFailureConstructor,
  ).flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const close = readableClose(closing, open);
    if (close === -1) {
      return [];
    }
    const flag = splitTopLevel(text, ignored, open + 1, close)[2];
    return flag?.text === "true" ? [flag.offset] : [];
  });

  return [...fromFactory, ...fromCreate, ...fromConstructor]
    .sort((a, b) => a - b)
    .map((offset) => ({ line: lineOf(offset) }));
};

/**
 * How identification recognises TypeScript: an import from the SDK, or an exported async
 * function.
 */
export const typescriptRecognition: SdkRecognition = {
  sdkMarkers: [
    typescriptSdkImport,
    typescriptExportedAsyncFunction,
    typescriptExportedAsyncArrow,
  ],
  activityMarkers: [
    typescriptExportedAsyncFunction,
    typescriptExportedAsyncArrow,
  ],
};

/**
 * Detects TypeScript activities. The file-wide facts (non-retryable errors, configuration read,
 * dependencies and heartbeats) are read from the whole file and reported on every activity.
 */
export const typescriptDetector: Detector = {
  detect(source: Source) {
    const { text } = source;
    const ignored = ignoredSpans(text);
    const enclosing = enclosingBrackets(text, ignored);
    const reading: Reading = {
      text,
      ignored,
      enclosing,
      closing: closingBrackets(text, enclosing),
      lineOf: lineFinder(text),
    };
    const { lineOf } = reading;
    const inCode = (match: RegExpExecArray) => !isInside(ignored, match.index);
    const found = (pattern: Pattern) =>
      allMatches(pattern, text, "d").filter(inCode);

    /** Reads the function a match ends at, the match's group 1 being its name. */
    const activityAt = (match: RegExpExecArray) => {
      const name = match[1] ?? "";
      const nameOffset = match.indices?.[1]?.[0] ?? match.index;
      const signature = readActivity(
        reading,
        name,
        nameOffset,
        match.index + match[0].length - 1,
      );
      return signature === null ? [] : [{ offset: nameOffset, signature }];
    };

    const exportedObjects = new Set(
      found(typescriptExportedObject).map(
        (match) => match.index + match[0].length - 1,
      ),
    );
    const isObjectMember = (match: RegExpExecArray) =>
      exportedObjects.has(enclosing[match.index] ?? -1);

    const activities = [
      ...found(typescriptExportedAsyncFunction).flatMap(activityAt),
      ...found(typescriptExportedAsyncArrow).flatMap(activityAt),
      ...found(typescriptObjectAsyncMethod)
        .filter(isObjectMember)
        .flatMap(activityAt),
      ...found(typescriptObjectAsyncProperty)
        .filter(isObjectMember)
        .flatMap(activityAt),
    ].sort((a, b) => a.offset - b.offset);

    const nonRetryableErrors = readNonRetryableErrors(reading, found);
    const configurationRead = firstByName(
      found(typescriptEnvironmentRead).map((match) => ({
        name: match[1] ?? match[3] ?? "",
        line: lineOf(match.index),
      })),
    );
    const dependencies = readDependencies(text, lineOf, inCode);
    const heartbeats: LineRef[] = found(typescriptHeartbeatCall).map(
      (match) => ({ line: lineOf(match.index) }),
    );

    return activities.map(({ signature }) => ({
      ...signature,
      nonRetryableErrors,
      configurationRead,
      dependencies,
      heartbeats,
    }));
  },
};
