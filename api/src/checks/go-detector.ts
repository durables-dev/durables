import type { Detector } from "./detector";
import type { ActivityFacts, LineRef, NamedLineRef } from "./facts";
import type { SdkRecognition } from "./identify";
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

// Go detection (ADR 0008). Every pattern below is part of the published rubric. A match only
// counts when it starts in code: a match that starts inside a comment, a string or a rune
// literal is ignored, so commented-out code and examples in strings are never detected.
//
// A Go activity is an exported function or struct method that returns an error, or a value
// and an error. Its first parameter, a context.Context, is optional, so a Go activity may carry
// no Temporal marker at all. Identification then infers Go from the function's shape.

/** A Go import of a Temporal SDK package, such as `"go.temporal.io/sdk/activity"`. */
export const goSdkImport: Pattern = {
  name: "go-sdk-import",
  description:
    'A Go import of a Temporal SDK package from go.temporal.io/sdk, such as "go.temporal.io/sdk/activity".',
  regex: /"go\.temporal\.io\/sdk(?:\/[\w./-]*)?"/,
};

/** A Go import of the SDK's activity package. */
export const goActivityImport: Pattern = {
  name: "go-activity-import",
  description:
    'A Go import of the Temporal SDK\'s activity package, "go.temporal.io/sdk/activity".',
  regex: /"go\.temporal\.io\/sdk\/activity"/,
};

/** A Go function whose first parameter is a `context.Context`, the shape of a Go activity. */
export const goActivityFunction: Pattern = {
  name: "go-activity-function",
  description:
    "A Go function, or method, whose first parameter is a context.Context, which is how a Go activity is declared.",
  regex:
    /^[ \t]*func[ \t]+(?:\([^)]*\)[ \t]*)?[A-Za-z_]\w*[ \t]*\([ \t]*\w+[ \t]+context\.Context\b/m,
};

/**
 * An exported Go function or method that returns an error, or a value and an error, on one
 * declaration line. Temporal's Go activities need no context parameter and no SDK import, so
 * this is how identification infers Go when no Temporal marker matches.
 */
export const goActivityShape: Pattern = {
  name: "go-activity-shape",
  description:
    "An exported Go function or method, its name starting with a capital letter, that takes no workflow.Context and returns error or a value and an error, such as func ComposeGreeting(name string) (string, error) {. Code with no Temporal marker that has one is inferred to be Go.",
  regex:
    /^[ \t]*func[ \t]+(?:\([^()\n]*\)[ \t]*)?[A-Z]\w*[ \t]*\((?![^()\n]*\bworkflow\.Context\b)(?:[^()\n]|\([^()\n]*\))*\)[ \t]*(?:error|\((?:[^()\n]|\([^()\n]*\))*\berror[ \t]*\))[ \t]*\{/m,
};

/**
 * A function or method declaration, up to the opening parenthesis of its parameters. Group 1 is
 * the receiver, when it is a method, and group 2 the name. A function literal has no name and
 * does not match.
 */
export const goFunctionDeclaration: Pattern = {
  name: "go-function-declaration",
  description:
    "A Go function or method declaration at the start of a line, such as func Charge( or func (a *Activities) Charge(. Each one is read as a possible activity.",
  regex:
    /^[ \t]*func[ \t]+(?:\(([^()\n]*)\)[ \t]*)?([A-Za-z_]\w*)[ \t]*(?:\[[^\]\n]*\][ \t]*)?\(/m,
};

/**
 * A function's results, read from just after its parameters up to the brace that opens its
 * body. Group 1 is the results: a parenthesised list, or a single type.
 */
export const goFunctionResults: Pattern = {
  name: "go-function-results",
  description:
    "A function's results, between its parameters and the brace that opens its body, such as (*ChargeResult, error) or error. A single result without brackets is at most 200 characters.",
  regex: /[ \t]*(\((?:[^()]|\([^()]*\))*\)|[^{}()\n]{0,200}?)[ \t]*\{/,
};

/** A name Go exports: one that starts with a capital letter. */
export const goExportedName: Pattern = {
  name: "go-exported-name",
  description:
    "A name that starts with a capital letter, which Go exports. A Go activity is an exported function or method, so the worker can register it from another package.",
  regex: /^[A-Z]/,
};

/**
 * One parameter or result, with or without a name. Group 1 is the name, when there is one, and
 * group 2 the type. A lone word is a type.
 */
export const goParameter: Pattern = {
  name: "go-parameter",
  description:
    "One parameter or result, such as input ChargeRequest, ctx context.Context or *ChargeResult. A name is optional; a lone type is read as the type.",
  regex:
    /^(?:(?!(?:map|chan|func|struct|interface)\b)([A-Za-z_]\w*)\s+)?(\S[\s\S]*)$/,
};

/** The `context.Context` type, which an activity takes first and which is not its input. */
export const goContextType: Pattern = {
  name: "go-context-type",
  description:
    "The context.Context type. An activity may take it as its first parameter. It is not the activity's input.",
  regex: /^context\.Context$/,
};

/** The `workflow.Context` type, which marks a workflow rather than an activity. */
export const goWorkflowContextType: Pattern = {
  name: "go-workflow-context-type",
  description:
    "The workflow.Context type. A function that takes it is a workflow, not an activity.",
  regex: /^workflow\.Context$/,
};

/** The `error` type, which an activity's last result must be. */
export const goErrorType: Pattern = {
  name: "go-error-type",
  description:
    "The error type. A Go activity returns error alone, or a value and then an error.",
  regex: /^error$/,
};

/** A type that reads as a type name. Anything else is shown as unknown. */
export const goTypeName: Pattern = {
  name: "go-type-name",
  description:
    "A type that can be shown as a type name, such as ChargeRequest, *ChargeResult, models.Charge, []string or map[string]int. Anything else, such as a variadic or a function type, is shown as unknown.",
  regex:
    /^(?:\*|\[\d*\]|map\[[\w.*[\]]+\])*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?(?:\[[\w.*, [\]]+\])?$/,
};

/**
 * A call that makes a non-retryable application error, such as
 * `temporal.NewNonRetryableApplicationError(`.
 */
export const goNonRetryableError: Pattern = {
  name: "go-non-retryable-error",
  description:
    "A call to the SDK's temporal.NewNonRetryableApplicationError, which makes an error Temporal never retries. The line reported is the line of the call.",
  regex: /(?<![\w.])(?:[A-Za-z_]\w*\.)?NewNonRetryableApplicationError\s*\(/,
};

/**
 * A call to `temporal.NewApplicationErrorWithOptions(`, up to the opening parenthesis of its
 * arguments. It counts when `goNonRetryableOption` sits in an options literal among those
 * arguments.
 */
export const goApplicationErrorWithOptions: Pattern = {
  name: "go-application-error-with-options",
  description:
    "A call to the SDK's temporal.NewApplicationErrorWithOptions with an ApplicationErrorOptions literal setting NonRetryable: true among its own arguments. Options built elsewhere and passed in a variable are not read. The line reported is the line of NonRetryable: true.",
  regex: /(?<![\w.])(?:[A-Za-z_]\w*\.)?NewApplicationErrorWithOptions\s*\(/,
};

/** The `NonRetryable: true` field, as read inside an application error's options literal. */
export const goNonRetryableOption: Pattern = {
  name: "go-non-retryable-option",
  description:
    "The field NonRetryable: true. It marks an error as non-retryable only inside an options literal passed directly to NewApplicationErrorWithOptions.",
  regex: /(?<![\w.])NonRetryable\s*:\s*true\b/,
};

/** An environment variable read by name. Group 1 or group 2 is the variable's name. */
export const goEnvironmentRead: Pattern = {
  name: "go-environment-read",
  description:
    'An environment variable read by name: os.Getenv("NAME") or os.LookupEnv("NAME").',
  regex:
    /(?<![\w.])os\s*\.\s*(?:Getenv|LookupEnv)\s*\(\s*(?:"([A-Za-z_]\w*)"|`([A-Za-z_]\w*)`)/,
};

/**
 * An import declaration: a parenthesised group or a single import. Group 1 is a group's body,
 * group 2 a single import. Read with comments blanked out.
 */
export const goImportDeclaration: Pattern = {
  name: "go-import-declaration",
  description:
    'An import declaration, either a group such as import ( "fmt" ) or a single import such as import stripe "github.com/stripe/stripe-go/v87".',
  regex:
    /^[ \t]*import[ \t]*(?:\(([^)]*)\)|((?:[A-Za-z_]\w*|\.)?[ \t]*(?:"[^"\n]*"|`[^`]*`)))/m,
};

/**
 * One import inside an import declaration, with an optional name such as `stripe`, `_` or `.`.
 * Group 1 or group 2 is the import path.
 */
export const goImportSpec: Pattern = {
  name: "go-import-spec",
  description:
    'One import path in an import declaration, with or without a name in front, such as "net/http", _ "github.com/lib/pq" or stripe "github.com/stripe/stripe-go/v87". The dependency is the import path.',
  regex: /(?:[A-Za-z_]\w*|\.)?[ \t]*(?:"([^"\n]*)"|`([^`]*)`)/,
};

/**
 * A heartbeat call, such as `activity.RecordHeartbeat(ctx, progress)`. The line reported is the
 * line of `RecordHeartbeat`.
 */
export const goHeartbeatCall: Pattern = {
  name: "go-heartbeat-call",
  description:
    "A call to the SDK's activity.RecordHeartbeat, with or without details, such as activity.RecordHeartbeat(ctx, progress).",
  regex: /(?<![\w.])[A-Za-z_]\w*\s*\.\s*RecordHeartbeat\s*\(/,
};

/**
 * A comment, a string or a rune literal. Matches that start inside one are ignored. An
 * unterminated interpreted string or rune runs to the end of its line; an unterminated raw
 * string or block comment runs to the end of the file.
 */
export const goCommentOrString: Pattern = {
  name: "go-comment-or-string",
  description:
    "A comment, a string or a rune literal. Nothing that starts inside one is detected, so commented-out code and examples inside strings are ignored.",
  regex:
    /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|`[^`]*`?|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/,
};

/**
 * An import path in Go's standard library: one whose first element has no dot, as the go tool
 * decides it. The publisher's own packages, in a module whose path has no dot, read the same
 * way, and they are not third-party either.
 */
export const goStandardLibraryPath: Pattern = {
  name: "go-standard-library-path",
  description:
    "An import path whose first element has no dot, such as fmt, context or net/http. Go's standard library is exactly these, so they are never dependencies.",
  regex: /^[^./]+(?:\/|$)/,
};

/**
 * A module's major-version suffix, such as `/v87` in `github.com/stripe/stripe-go/v87`. Go puts
 * it at the end of the module path for every major version from 2.
 */
export const goMajorVersionSuffix: Pattern = {
  name: "go-major-version-suffix",
  description:
    "A major-version suffix, such as /v87 in github.com/stripe/stripe-go/v87/paymentintent. It ends a module path from version 2 on. Integrations are matched on the path before it, so every major version maps to the same integration.",
  regex: /\/v(?:[2-9]|[1-9]\d+)(?=\/|$)/,
};

/** Every Go pattern, as published in the rubric. */
export const goPatterns: readonly Pattern[] = [
  goSdkImport,
  goActivityImport,
  goActivityFunction,
  goActivityShape,
  goFunctionDeclaration,
  goFunctionResults,
  goExportedName,
  goParameter,
  goContextType,
  goWorkflowContextType,
  goErrorType,
  goTypeName,
  goNonRetryableError,
  goApplicationErrorWithOptions,
  goNonRetryableOption,
  goEnvironmentRead,
  goImportDeclaration,
  goImportSpec,
  goHeartbeatCall,
  goCommentOrString,
  goStandardLibraryPath,
  goMajorVersionSuffix,
];

/** The prefix of Temporal's own Go modules, which Dependencies leaves out. */
const temporalModulePrefix = "go.temporal.io/";

/** Whether an import path is in Go's standard library. */
export const isGoStandardLibrary = (path: string) =>
  goStandardLibraryPath.regex.test(path);

/**
 * The integration key for a Go import path: the path before its major-version suffix, if it
 * has one, in lower case. `github.com/stripe/stripe-go/v87/paymentintent` becomes
 * `github.com/stripe/stripe-go`.
 */
export const normaliseGoDependency = (path: string) => {
  const suffix = goMajorVersionSuffix.regex.exec(path);
  return (suffix === null ? path : path.slice(0, suffix.index)).toLowerCase();
};

/** A comment, string or rune literal, and whether it is a comment. */
interface Lexed extends Span {
  readonly comment: boolean;
}

/** The comments, strings and rune literals of the text, in order. */
const lex = (text: string): Lexed[] =>
  allMatches(goCommentOrString, text).map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    comment: match[0].startsWith("/"),
  }));

/** The text with every comment replaced by spaces, keeping line breaks, so offsets hold. */
const withoutComments = (text: string, lexed: readonly Lexed[]) => {
  // Split by UTF-16 code unit, so offsets into the text index the array.
  const characters = text.split("");
  for (const { start, end, comment } of lexed) {
    if (comment) {
      for (let i = start; i < end; i++) {
        if (characters[i] !== "\n") {
          characters[i] = " ";
        }
      }
    }
  }
  return characters.join("");
};

/**
 * The offset of the bracket that closes the one at `open`, skipping the ignored spans, or -1
 * when it never closes.
 */
const closingBracket = (
  text: string,
  ignored: readonly Span[],
  open: number,
) => {
  let depth = 0;
  let next = ignored.findIndex((span) => span.end > open);
  for (let i = open; i < text.length; i++) {
    const span = next === -1 ? undefined : ignored[next];
    if (span !== undefined && i >= span.start) {
      i = span.end - 1;
      next = next + 1 < ignored.length ? next + 1 : -1;
      continue;
    }
    const character = text[i] ?? "";
    if ("([{".includes(character)) {
      depth++;
    } else if (")]}".includes(character)) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
};

/** Splits a parameter or result list on its top-level commas, leaving out empty entries. */
const splitList = (list: string) => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of list) {
    if ("([{".includes(character)) {
      depth++;
    } else if (")]}".includes(character)) {
      depth--;
    }
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
};

/** The type of one parameter or result, without its name. */
const typeOf = (entry: string) =>
  (goParameter.regex.exec(entry)?.[2] ?? entry).trim();

/** The type name a type reads as, or null when it can't be read. */
const typeName = (type: string) => {
  const trimmed = type.trim();
  return goTypeName.regex.test(trimmed) ? trimmed : null;
};

/** A function declaration read as a possible activity. */
interface Candidate {
  readonly signature: Pick<
    ActivityFacts,
    "activity" | "input" | "output" | "runsAs"
  >;
  /** Whether its first parameter is a context.Context. */
  readonly takesContext: boolean;
}

/**
 * Reads the results: an activity returns `error`, or a value and then `error`. The output is
 * the value's type, or null with none. Null when the results are not an activity's.
 */
const readResults = (results: string): { output: string | null } | null => {
  const trimmed = results.trim();
  const types = (
    trimmed.startsWith("(") ? splitList(trimmed.slice(1, -1)) : [trimmed]
  ).map(typeOf);
  const last = types[types.length - 1];
  if (last === undefined || !goErrorType.regex.test(last)) {
    return null;
  }
  if (types.length === 1) {
    return { output: null };
  }
  const [value] = types;
  return types.length === 2 && value !== undefined
    ? { output: typeName(value) }
    : null;
};

/**
 * Reads the declaration as an activity. Null unless it is exported, takes no workflow.Context
 * and returns an error last.
 */
const readCandidate = (
  text: string,
  ignored: readonly Span[],
  lineOf: LineOf,
  resultsAt: RegExp,
  declaration: RegExpExecArray,
): Candidate | null => {
  const name = declaration[2] ?? "";
  if (!goExportedName.regex.test(name)) {
    return null;
  }
  const open = declaration.index + declaration[0].length - 1;
  const close = closingBracket(text, ignored, open);
  if (close === -1) {
    return null;
  }
  resultsAt.lastIndex = close + 1;
  const results = resultsAt.exec(text);
  const read = results === null ? null : readResults(results[1] ?? "");
  if (read === null) {
    return null;
  }
  const parameterTypes = splitList(text.slice(open + 1, close)).map(typeOf);
  if (parameterTypes.some((type) => goWorkflowContextType.regex.test(type))) {
    return null;
  }
  const [first] = parameterTypes;
  const takesContext = first !== undefined && goContextType.regex.test(first);
  const inputs = takesContext ? parameterTypes.slice(1) : parameterTypes;
  const [onlyInput] = inputs;
  return {
    signature: {
      activity: {
        name,
        line: lineOf(declaration.index + declaration[0].lastIndexOf(name)),
      },
      input:
        inputs.length === 1 && onlyInput !== undefined
          ? typeName(onlyInput)
          : null,
      output: read.output,
      // A Go activity is a plain function the SDK calls on its own goroutine.
      runsAs: "sync",
    },
    takesContext,
  };
};

/**
 * The activities among the candidates. When any takes a context.Context first, only those are
 * activities, so an exported helper beside them isn't counted.
 */
const activitiesAmong = (candidates: readonly Candidate[]) => {
  const withContext = candidates.filter(({ takesContext }) => takesContext);
  return (withContext.length > 0 ? withContext : candidates).map(
    ({ signature }) => signature,
  );
};

/** Each third-party package imported, by import path, with the line of its first import. */
const readDependencies = (
  text: string,
  lexed: readonly Lexed[],
  lineOf: LineOf,
  inCode: (offset: number) => boolean,
  isStandardLibrary: (name: string) => boolean,
): NamedLineRef[] => {
  const code = withoutComments(text, lexed);
  const imports = allMatches(goImportDeclaration, code)
    .filter((match) => inCode(match.index + match[0].indexOf("import")))
    .flatMap((match) => {
      const body = match[1] ?? match[2] ?? "";
      const bodyStart =
        match.index +
        match[0].length -
        body.length -
        (match[1] === undefined ? 0 : 1);
      return allMatches(goImportSpec, body).map((spec) => ({
        name: spec[1] ?? spec[2] ?? "",
        offset: bodyStart + spec.index,
      }));
    });
  return firstByName(
    imports
      .filter(
        ({ name }) =>
          name !== "" &&
          !name.startsWith(temporalModulePrefix) &&
          !isStandardLibrary(name),
      )
      .map(({ name, offset }) => ({ name, line: lineOf(offset) })),
  );
};

/**
 * How identification recognises Go: an import of the SDK, or, with no Temporal marker, an
 * activity's shape.
 */
export const goRecognition: SdkRecognition = {
  sdkMarkers: [goSdkImport],
  activityMarkers: [goActivityImport, goActivityFunction],
  shapeMarkers: [goActivityFunction, goActivityShape],
};

/**
 * Detects Go activities. The file-wide facts (non-retryable errors, configuration read,
 * dependencies and heartbeats) are read from the whole file and reported on every activity.
 */
export const goDetector: Detector = {
  detect(source, isStandardLibrary) {
    const { text } = source;
    const lineOf = lineFinder(text);
    const lexed = lex(text);
    const ignored: readonly Span[] = lexed.filter(
      (span) => span.end > span.start,
    );
    const inCode = (offset: number) => !isInside(ignored, offset);
    const found = (pattern: Pattern) =>
      allMatches(pattern, text).filter((match) => inCode(match.index));

    const enclosing = enclosingBrackets(text, ignored);
    const nonRetryableCalls: LineRef[] = found(goNonRetryableError).map(
      (match) => ({ line: lineOf(match.index) }),
    );
    // The first NonRetryable: true in a literal directly inside each open bracket, by that
    // bracket's offset: the literal's brace sits in the call's parenthesis.
    const nonRetryableOptions = new Map<number, number>();
    for (const match of found(goNonRetryableOption).reverse()) {
      const literal = enclosing[match.index] ?? -1;
      if (literal !== -1 && text[literal] === "{") {
        nonRetryableOptions.set(enclosing[literal] ?? -1, match.index);
      }
    }
    const nonRetryableWithOptions: LineRef[] = found(
      goApplicationErrorWithOptions,
    ).flatMap((call) => {
      const option = nonRetryableOptions.get(call.index + call[0].length - 1);
      return option === undefined ? [] : [{ line: lineOf(option) }];
    });
    const nonRetryableErrors = [
      ...nonRetryableCalls,
      ...nonRetryableWithOptions,
    ].sort((a, b) => a.line - b.line);
    const configurationRead = firstByName(
      found(goEnvironmentRead).map((match) => ({
        name: match[1] ?? match[2] ?? "",
        line: lineOf(match.index),
      })),
    );
    const dependencies = readDependencies(
      text,
      lexed,
      lineOf,
      inCode,
      isStandardLibrary,
    );
    const heartbeats: LineRef[] = found(goHeartbeatCall).map((match) => ({
      line: lineOf(match.index + match[0].indexOf("RecordHeartbeat")),
    }));

    const resultsAt = new RegExp(
      goFunctionResults.regex.source,
      `${goFunctionResults.regex.flags}y`,
    );
    const candidates = allMatches(goFunctionDeclaration, text)
      .filter((declaration) =>
        inCode(declaration.index + declaration[0].indexOf("func")),
      )
      .flatMap((declaration) => {
        const candidate = readCandidate(
          text,
          ignored,
          lineOf,
          resultsAt,
          declaration,
        );
        return candidate === null ? [] : [candidate];
      });
    return activitiesAmong(candidates).map((signature) => ({
      ...signature,
      nonRetryableErrors,
      configurationRead,
      dependencies,
      heartbeats,
    }));
  },
};
