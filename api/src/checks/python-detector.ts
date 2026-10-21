import type { Detector } from "./detector";
import type { ActivityFacts, LineRef, NamedLineRef } from "./facts";
import type { Pattern } from "./pattern";
import { pythonStandardLibrary } from "./python-stdlib";
import type { Source } from "./source";

// Python detection (ADR 0008). Every pattern below is part of the published rubric. A match
// only counts when it starts in code: a pattern that starts inside a comment or a string
// literal is ignored, so commented-out code and examples in docstrings are never detected.

/** An import of the Temporal Python SDK, such as `from temporalio import activity`. */
export const pythonSdkImport: Pattern = {
  name: "python-sdk-import",
  description:
    "An import of the Temporal Python SDK, temporalio, such as from temporalio import activity or import temporalio.",
  regex:
    /^[ \t]*(?:from[ \t]+temporalio(?:\.[\w.]+)?[ \t]+import\b|import[ \t]+temporalio\b)/m,
};

/** The `@activity.defn` decorator, with or without arguments. */
export const pythonActivityDecorator: Pattern = {
  name: "python-activity-decorator",
  description:
    'The @activity.defn decorator at the start of a line, with or without arguments, such as @activity.defn(name="charge"). It marks the function below it as a Temporal activity.',
  regex: /^[ \t]*@(?:temporalio\.)?activity\.defn\b(?:[ \t]*\([^)]*\))?[^\n]*/m,
};

/**
 * The function an activity decorator applies to, read from the end of the decorator's line.
 * Blank lines, comments and other decorators may sit between them. Groups: 1 the lines before
 * the `def`, 2 `async` when present, 3 the name, 4 the parameters, 5 the return annotation.
 */
export const pythonActivityFunction: Pattern = {
  name: "python-activity-function",
  description:
    "The function under an @activity.defn decorator: def or async def, its name, its parameters and its return annotation after ->. Blank lines, comments and other decorators may come between the decorator and the def.",
  regex:
    /^((?:\n[ \t]*(?:@[^\n]*|#[^\n]*)?)*\n)[ \t]*(async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(((?:[^()]|\([^()]*\))*)\)[ \t]*(?:->[ \t]*([^:\n]+?)[ \t]*)?:/,
};

/** One parameter with a type annotation, such as `input: SlackMessage`. Groups: 1 name, 2 type. */
export const pythonAnnotatedParameter: Pattern = {
  name: "python-annotated-parameter",
  description:
    "A function parameter with a type annotation, such as input: SlackMessage, optionally followed by a default value.",
  regex: /^\s*([A-Za-z_]\w*)\s*:\s*([^=]*?)\s*(?:=[\s\S]*)?$/,
};

/**
 * A type annotation that reads as a type name: a name or dotted name, optionally with simple
 * subscripts or `|` unions, optionally quoted as a forward reference. Group 2 is the name.
 */
export const pythonTypeName: Pattern = {
  name: "python-type-name",
  description:
    "A type annotation that can be shown as a type name, such as SlackMessage, models.SlackMessage, list[str] or MessageRef | None, optionally in quotes. Anything else is shown as unknown.",
  regex:
    /^(["']?)([A-Za-z_][\w.]*(?:\[[\w., |[\]]*\])?(?:[ \t]*\|[ \t]*[A-Za-z_][\w.]*(?:\[[\w., |[\]]*\])?)*)\1$/,
};

/** A non-retryable application error being raised, such as `raise ApplicationError(..., non_retryable=True)`. */
export const pythonNonRetryableRaise: Pattern = {
  name: "python-non-retryable-raise",
  description:
    "A raise of the SDK's ApplicationError with non_retryable=True among its arguments. The line reported is the line of non_retryable=True.",
  regex:
    /(?<![\w.])raise[ \t]+(?:[\w.]+\.)?ApplicationError\s*\((?:[^()]|\([^()]*\))*?\bnon_retryable\s*=\s*True\b/,
};

/** An environment variable read by name. Group 2 is the variable's name. */
export const pythonEnvironmentRead: Pattern = {
  name: "python-environment-read",
  description:
    'An environment variable read by name: os.environ["NAME"], os.environ.get("NAME") or os.getenv("NAME"), with or without the os. prefix.',
  regex:
    /(?<![\w.])(?:os\.)?(?:environ\s*\[|environ\.get\s*\(|getenv\s*\()\s*(["'])([A-Za-z_]\w*)\1/,
};

/** An `import` statement. Group 1 is the comma-separated list of modules. */
export const pythonImportStatement: Pattern = {
  name: "python-import-statement",
  description:
    "An import statement, such as import httpx or import a.b as c, d, at the start of a line or after a semicolon, including inside functions.",
  regex: /(?:^|;)[ \t]*import[ \t]+([^\n#;]+)/m,
};

/** One module in an `import` statement's list. Group 1 is its top-level package. */
export const pythonImportedModule: Pattern = {
  name: "python-imported-module",
  description:
    "One module named in an import statement, such as httpx, a.b or httpx as h. The package is the first part of the name.",
  regex: /^\s*([A-Za-z_]\w*)(?:\s*\.\s*\w+)*(?:\s+as\s+\w+)?\s*$/,
};

/**
 * A `from … import` statement with an absolute module. Group 1 is its top-level package.
 * Relative imports, such as `from . import models`, do not match.
 */
export const pythonFromImport: Pattern = {
  name: "python-from-import",
  description:
    "A from … import statement, such as from httpx import Client or from a.b import c. The package is the first part of the module. Relative imports such as from .models import X are not dependencies.",
  regex: /(?:^|;)[ \t]*from[ \t]+([A-Za-z_]\w*)[\w.]*[ \t]+import\b/m,
};

/** A heartbeat call, such as `activity.heartbeat()`. */
export const pythonHeartbeatCall: Pattern = {
  name: "python-heartbeat-call",
  description:
    "A call to the SDK's activity.heartbeat(), with or without arguments.",
  regex: /(?<![\w.])(?:temporalio\.)?activity\.heartbeat\s*\(/,
};

/**
 * A comment or a string literal. Matches that start inside one are ignored. An unterminated
 * string runs to the end of its line, or for a triple-quoted string, to the end of the file.
 */
export const pythonCommentOrString: Pattern = {
  name: "python-comment-or-string",
  description:
    "A comment or a string literal. Nothing that starts inside one is detected, so commented-out code and examples inside strings are ignored.",
  regex:
    /#[^\n]*|"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/,
};

/** Every Python pattern, as published in the rubric. */
export const pythonPatterns: readonly Pattern[] = [
  pythonSdkImport,
  pythonActivityDecorator,
  pythonActivityFunction,
  pythonAnnotatedParameter,
  pythonTypeName,
  pythonNonRetryableRaise,
  pythonEnvironmentRead,
  pythonImportStatement,
  pythonImportedModule,
  pythonFromImport,
  pythonHeartbeatCall,
  pythonCommentOrString,
];

/** The Temporal SDK's own package, which Dependencies leaves out. */
const temporalSdkPackage = "temporalio";

/** Every match of a pattern in the text, in order. */
const allMatches = (pattern: Pattern, text: string) => [
  ...text.matchAll(new RegExp(pattern.regex.source, `${pattern.regex.flags}g`)),
];

interface Span {
  readonly start: number;
  readonly end: number;
}

/** Whether an offset falls inside one of the spans, which are in order and don't overlap. */
const isInside = (spans: readonly Span[], offset: number) => {
  let low = 0;
  let high = spans.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const span = spans[middle];
    if (span === undefined) {
      return false;
    }
    if (offset < span.start) {
      high = middle - 1;
    } else if (offset >= span.end) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
};

/** The 1-based line number of an offset in the text. */
type LineOf = (offset: number) => number;

/**
 * Numbers lines the way `lineAt` does, from an index of line starts built once, so that a file
 * with many matches is not rescanned from the top for each one.
 */
const lineFinder = (text: string): LineOf => {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low + 1;
  };
};

/** Splits a parameter list on its top-level commas, leaving out empty entries. */
const splitParameters = (parameters: string) => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of parameters) {
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

/** Parameters that are not the activity's input: a method's receiver and the `*` and `/` markers. */
const notInput = new Set(["self", "cls", "*", "/"]);

/** The type name an annotation reads as, or null when it can't be read. */
const typeName = (annotation: string) =>
  pythonTypeName.regex.exec(annotation.trim())?.[2] ?? null;

type ActivitySignature = Pick<
  ActivityFacts,
  "activity" | "input" | "output" | "runsAs"
>;

/**
 * Reads the function after an activity decorator. Null unless it has at least one parameter
 * with a type annotation and a return annotation.
 */
const readActivity = (
  source: Source,
  lineOf: LineOf,
  afterDecorator: number,
): ActivitySignature | null => {
  const match = pythonActivityFunction.regex.exec(
    source.text.slice(afterDecorator),
  );
  if (match === null) {
    return null;
  }
  const [, before = "", isAsync, name = "", parameterList = "", returns] =
    match;
  const parameters = splitParameters(parameterList).filter(
    (parameter) => !notInput.has(parameter),
  );
  const annotated = parameters.flatMap((parameter) => {
    const found = pythonAnnotatedParameter.regex.exec(parameter);
    return found?.[2] ? [found[2]] : [];
  });
  if (annotated.length === 0 || returns === undefined) {
    return null;
  }
  const [onlyInput] = annotated;
  return {
    activity: { name, line: lineOf(afterDecorator + before.length) },
    input:
      parameters.length === 1 && onlyInput !== undefined
        ? typeName(onlyInput)
        : null,
    output: typeName(returns),
    runsAs: isAsync === undefined ? "sync" : "async",
  };
};

/** Keeps the first entry for each name. */
const firstByName = (found: readonly NamedLineRef[]) => {
  const seen = new Set<string>();
  return found.filter(({ name }) => {
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
};

/** Each third-party package imported, with the line of its first import. */
const readDependencies = (
  source: Source,
  lineOf: LineOf,
  inCode: (match: RegExpExecArray) => boolean,
): NamedLineRef[] => {
  const imports = allMatches(pythonImportStatement, source.text)
    .filter(inCode)
    .flatMap((match) =>
      (match[1] ?? "").split(",").flatMap((module) => {
        const name = pythonImportedModule.regex.exec(module)?.[1];
        return name === undefined ? [] : [{ name, offset: match.index }];
      }),
    );
  const fromImports = allMatches(pythonFromImport, source.text)
    .filter(inCode)
    .flatMap((match) =>
      match[1] === undefined ? [] : [{ name: match[1], offset: match.index }],
    );
  const thirdParty = [...imports, ...fromImports]
    .filter(
      ({ name }) =>
        name !== temporalSdkPackage && !pythonStandardLibrary.has(name),
    )
    .sort((a, b) => a.offset - b.offset)
    .map(({ name, offset }) => ({ name, line: lineOf(offset) }));
  return firstByName(thirdParty);
};

/**
 * Detects Python activities. The file-wide facts (non-retryable errors, configuration read,
 * dependencies and heartbeats) are read from the whole file and reported on every activity.
 */
export const pythonDetector: Detector = {
  sdk: "Python",
  sdkMarkers: [pythonSdkImport, pythonActivityDecorator],
  activityMarkers: [pythonActivityDecorator],
  detect(source) {
    const { text } = source;
    const lineOf = lineFinder(text);
    const ignored: Span[] = allMatches(pythonCommentOrString, text).map(
      (match) => ({ start: match.index, end: match.index + match[0].length }),
    );
    const inCode = (match: RegExpExecArray) => !isInside(ignored, match.index);
    const found = (pattern: Pattern) =>
      allMatches(pattern, text).filter(inCode);

    const nonRetryableErrors: LineRef[] = found(pythonNonRetryableRaise).map(
      (match) => ({
        line: lineOf(match.index + match[0].lastIndexOf("non_retryable")),
      }),
    );
    const configurationRead = firstByName(
      found(pythonEnvironmentRead).map((match) => ({
        name: match[2] ?? "",
        line: lineOf(match.index),
      })),
    );
    const dependencies = readDependencies(source, lineOf, inCode);
    const heartbeats: LineRef[] = found(pythonHeartbeatCall).map((match) => ({
      line: lineOf(match.index),
    }));

    return found(pythonActivityDecorator).flatMap((decorator) => {
      const signature = readActivity(
        source,
        lineOf,
        decorator.index + decorator[0].length,
      );
      return signature === null
        ? []
        : [
            {
              ...signature,
              nonRetryableErrors,
              configurationRead,
              dependencies,
              heartbeats,
            },
          ];
    });
  },
};
