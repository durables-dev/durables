import type { Detector } from "./detector";
import type { ActivityFacts, LineRef, NamedLineRef } from "./facts";
import type { Pattern } from "./pattern";
import type { Source } from "./source";

// .NET detection (ADR 0008). Every pattern below is part of the published rubric. A match only
// counts when it starts in code: a match that starts inside a comment, a string or a character
// literal is ignored, so commented-out code and examples in strings are never detected. The
// holes of an interpolated string, the parts in braces, are code and are detected.

/**
 * A C# type as written: a name or dotted name, optionally `global::`, with generic arguments
 * nested up to three deep, `?` and array ranks; or a tuple. Shared by the patterns that read
 * types, so they all accept the same type names.
 */
const csharpType = String.raw`(?:(?:global::)?[A-Za-z_][\w.]*(?:[ \t]*<(?:[^<>(){};=\n]|<(?:[^<>(){};=\n]|<[^<>(){};=\n]*>)*>)*>)?\??(?:[ \t]*\[[ \t,]*\]\??)*|\((?:[^()\n]|\([^()\n]*\))*\))`;

/**
 * The start of a `using` directive, up to the namespace: `global`, `static` and an alias are
 * allowed, as is a `global::` qualifier.
 */
const usingDirectiveStart = String.raw`^[ \t]*(?:global[ \t]+)?using[ \t]+(?:static[ \t]+)?(?:[A-Za-z_]\w*[ \t]*=[ \t]*)?(?:global::)?`;

/** A `using` directive for the Temporal .NET SDK, such as `using Temporalio.Activities;`. */
export const dotnetSdkUsing: Pattern = {
  name: "dotnet-sdk-using",
  description:
    "A using directive for the Temporal .NET SDK's Temporalio namespace, such as using Temporalio.Activities; or global using Temporalio.Exceptions;.",
  regex: new RegExp(`${usingDirectiveStart}Temporalio\\b`, "m"),
};

/**
 * The `[Activity]` attribute at the start of a line, with or without arguments. It may share
 * its brackets or its line with other attributes, such as `[Obsolete, Activity("charge")]`.
 */
export const dotnetActivityAttribute: Pattern = {
  name: "dotnet-activity-attribute",
  description:
    'The [Activity] attribute at the start of a line, with or without arguments, such as [Activity("charge-card")]. It may be written ActivityAttribute or Temporalio.Activities.Activity, and may share its brackets or its line with other attributes. It marks the method below it, or after it on the same line, as a Temporal activity.',
  regex:
    /^[ \t]*(?:\[[^\]\n]*\][ \t]*)*\[(?:[^\]\n]*?,[ \t]*)?(?:global::)?(?:Temporalio\.Activities\.)?Activity(?:Attribute)?[ \t]*(?:\((?:[^()"\n]|"(?:[^"\\\n]|\\.)*")*\))?[ \t]*(?:,[^\]\n]*)?\]/m,
};

/**
 * What may sit between an activity attribute and its method: whitespace, comments and other
 * attributes. Read from the end of the attribute. It always matches, possibly nothing, and a
 * block comment ends at its first closing mark.
 */
export const dotnetBeforeMethod: Pattern = {
  name: "dotnet-before-method",
  description:
    "What may come between an [Activity] attribute and its method: whitespace, line and block comments, and other attributes such as [Obsolete].",
  regex: /(?:\s|\[[^\]\n]*\]|\/\/[^\n]*|\/\*(?:[^*]|\*(?!\/))*(?:\*\/|$))*/,
};

/**
 * The method an activity attribute applies to, read starting exactly where `dotnetBeforeMethod`
 * ends. Groups: 1 everything before the name, 2 the return type, 3 the name, 4 the parameters.
 */
export const dotnetActivityMethod: Pattern = {
  name: "dotnet-activity-method",
  description:
    "The method an [Activity] attribute applies to: its modifiers, its return type, its name and its parameters.",
  regex: new RegExp(
    String.raw`((?:(?:public|private|protected|internal|static|async|virtual|override|sealed|new|extern|unsafe|abstract|partial)\s+)*(${csharpType})\s+)([A-Za-z_]\w*)\s*(?:<[^<>()]*>\s*)?\(((?:[^()]|\([^()]*\))*)\)`,
  ),
};

/**
 * One method parameter, such as `ChargeRequest input`, optionally with attributes, a modifier
 * and a default value. Group 1 is its type.
 */
export const dotnetParameter: Pattern = {
  name: "dotnet-parameter",
  description:
    "One method parameter with its type, such as ChargeRequest input, optionally with attributes, a modifier such as in or ref, and a default value.",
  regex: new RegExp(
    String.raw`^(?:\[[^\]]*\]\s*)*(?:(?:this|ref|out|in|params|scoped|readonly)\s+)*(${csharpType})\s+@?[A-Za-z_]\w*\s*(?:=[\s\S]*)?$`,
  ),
};

/** A type that reads as a type name. Anything else is shown as unknown. */
export const dotnetTypeName: Pattern = {
  name: "dotnet-type-name",
  description:
    "A type that can be shown as a type name, such as ChargeRequest, Models.ChargeRequest, List<string>, string? or int[]. Anything else is shown as unknown.",
  regex: new RegExp(`^${csharpType}$`),
};

/**
 * A task return type: `Task`, `ValueTask`, or either with a result type, optionally qualified
 * with `System.Threading.Tasks`. Group 1 is the result type.
 */
export const dotnetTaskType: Pattern = {
  name: "dotnet-task-type",
  description:
    "A task return type: Task, Task<T>, ValueTask or ValueTask<T>. An activity returning one runs as async, and its output is T. A Task with no T has no output to show.",
  regex:
    /^(?:global::)?(?:System\.Threading\.Tasks\.)?(?:Task|ValueTask)(?:[ \t]*<([\s\S]*)>)?\??$/,
};

/**
 * A throw of the SDK's application failure, up to the opening parenthesis of its arguments,
 * such as `throw new ApplicationFailureException(`. It counts when
 * `dotnetNonRetryableArgument` is one of the arguments inside those parentheses.
 */
export const dotnetNonRetryableThrow: Pattern = {
  name: "dotnet-non-retryable-throw",
  description:
    "A throw of the SDK's ApplicationFailureException with nonRetryable: true among its own arguments. The arguments may nest calls to any depth, and brackets inside strings are ignored. The line reported is the line of nonRetryable: true.",
  regex:
    /(?<![\w.])throw\s+new\s+(?:global::)?(?:[\w.]+\.)?ApplicationFailureException\s*\(/,
};

/** The `nonRetryable: true` named argument, as read inside a thrown application failure. */
export const dotnetNonRetryableArgument: Pattern = {
  name: "dotnet-non-retryable-argument",
  description:
    "The named argument nonRetryable: true. It marks a failure as non-retryable only when it is an argument of the thrown ApplicationFailureException itself, not of a call nested inside it.",
  regex: /(?<![\w.@])nonRetryable\s*:\s*true\b/,
};

/** An environment variable read by name. Group 1 is the variable's name. */
export const dotnetEnvironmentRead: Pattern = {
  name: "dotnet-environment-read",
  description:
    'An environment variable read by name: Environment.GetEnvironmentVariable("NAME"), with or without the System. prefix.',
  regex:
    /(?<![\w.])(?:System\s*\.\s*)?Environment\s*\.\s*GetEnvironmentVariable\s*\(\s*@?"([A-Za-z_]\w*)"/,
};

/** A `using` directive. Group 1 is the root of the namespace it imports. */
export const dotnetUsingDirective: Pattern = {
  name: "dotnet-using-directive",
  description:
    "A using directive, such as using Stripe;, global using Amazon.S3;, using static Polly.Policy; or using Json = Newtonsoft.Json;. The dependency is the first part of the namespace. using statements and declarations, such as using var client = ..., are not directives.",
  regex: new RegExp(
    String.raw`${usingDirectiveStart}([A-Za-z_]\w*)(?:[ \t]*\.[ \t]*[A-Za-z_]\w*)*[ \t]*(?:<[^;\n]*>)?[ \t]*;`,
    "m",
  ),
};

/**
 * A heartbeat call, such as `ActivityExecutionContext.Current.Heartbeat()`, from the member
 * access dot. The line reported is the line of `Heartbeat`.
 */
export const dotnetHeartbeatCall: Pattern = {
  name: "dotnet-heartbeat-call",
  description:
    "A call to Heartbeat on the activity's execution context, with or without details, such as ActivityExecutionContext.Current.Heartbeat() or context.Heartbeat(progress).",
  regex: /\.\s*Heartbeat\s*\(/,
};

/** Every .NET pattern, as published in the rubric. */
export const dotnetPatterns: readonly Pattern[] = [
  dotnetSdkUsing,
  dotnetActivityAttribute,
  dotnetBeforeMethod,
  dotnetActivityMethod,
  dotnetParameter,
  dotnetTypeName,
  dotnetTaskType,
  dotnetNonRetryableThrow,
  dotnetNonRetryableArgument,
  dotnetEnvironmentRead,
  dotnetUsingDirective,
  dotnetHeartbeatCall,
];

/** Root namespaces Dependencies leaves out: the runtime's, Microsoft's and the SDK's own. */
const notDependencies = new Set(["System", "Microsoft", "Temporalio"]);

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

/** Numbers lines the way `lineAt` does, from an index of line starts built once. */
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

/** How many times `character` repeats from `at`. */
const runLength = (text: string, at: number, character: string) => {
  let end = at;
  while (text[end] === character) {
    end++;
  }
  return end - at;
};

/**
 * How deeply interpolated strings may nest inside each other's holes. Past it, the rest of the
 * file is read as string, so a pathological paste can't exhaust the stack.
 */
const maxInterpolationDepth = 16;

/**
 * Finds where the comments, strings and character literals of C# code are, so matches inside
 * them can be ignored. Reads `text` as code from `start`. Inside an interpolation hole, at
 * `holeDepth` 1 or more, it stops at the hole's closing brace, or at the colon that starts a
 * format, and returns that offset; at 0 it reads to the end. Each span found is pushed to
 * `spans`, in order.
 */
const lexCode = (
  text: string,
  start: number,
  spans: Span[],
  holeDepth: number,
): number => {
  const inHole = holeDepth > 0;
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const character = text[i];
    const next = text[i + 1];
    if (inHole) {
      if (character === "}" && depth === 0) {
        return i;
      }
      if (
        character === ":" &&
        depth === 0 &&
        next !== ":" &&
        text[i - 1] !== ":"
      ) {
        return i;
      }
      if (character === "(" || character === "[" || character === "{") {
        depth++;
      } else if (character === ")" || character === "]" || character === "}") {
        depth--;
      }
    }
    if (character === "/" && next === "/") {
      const newline = text.indexOf("\n", i);
      const end = newline === -1 ? text.length : newline;
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    if (character === "/" && next === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? text.length : close + 2;
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    if (character === "'") {
      let end = i + 1;
      while (end < text.length && text[end] !== "'" && text[end] !== "\n") {
        end += text[end] === "\\" ? 2 : 1;
      }
      end = Math.min(text.length, text[end] === "'" ? end + 1 : end);
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    const stringEnd = lexString(text, i, spans, holeDepth);
    if (stringEnd !== null) {
      i = stringEnd;
      continue;
    }
    i++;
  }
  return i;
};

/**
 * Reads a string literal starting at `start`, if one does: regular, verbatim (`@`), raw (three
 * or more quotes) or interpolated (`$`), in any combination C# allows. Pushes the spans of its
 * text, leaving out interpolation holes, which are read as code. Returns the offset after the
 * literal, or null when no string starts here.
 */
const lexString = (
  text: string,
  start: number,
  spans: Span[],
  holeDepth: number,
): number | null => {
  let quote = start;
  let dollars = 0;
  let verbatim = false;
  while (text[quote] === "$" || text[quote] === "@") {
    if (text[quote] === "$") {
      dollars++;
    } else {
      verbatim = true;
    }
    quote++;
  }
  if (text[quote] !== '"') {
    return null;
  }
  const quotes = runLength(text, quote, '"');
  const raw = !verbatim && quotes >= 3;
  if (!raw && !verbatim && quotes === 2) {
    spans.push({ start, end: quote + 2 });
    return quote + 2;
  }

  let segmentStart = start;
  let i = raw ? quote + quotes : quote + 1;
  while (i < text.length) {
    const character = text[i];
    if (raw && character === '"' && runLength(text, i, '"') >= quotes) {
      i += quotes;
      spans.push({ start: segmentStart, end: i });
      return i;
    }
    if (!raw && character === '"') {
      if (verbatim && text[i + 1] === '"') {
        i += 2;
        continue;
      }
      spans.push({ start: segmentStart, end: i + 1 });
      return i + 1;
    }
    if (!raw && !verbatim && character === "\\") {
      i += 2;
      continue;
    }
    if (!raw && !verbatim && character === "\n") {
      break;
    }
    if (dollars > 0 && character === "{") {
      const braces = runLength(text, i, "{");
      const opens = raw ? braces >= dollars : braces % 2 === 1;
      if (!opens) {
        i += braces;
        continue;
      }
      const holeStart = i + braces;
      if (holeDepth >= maxInterpolationDepth) {
        spans.push({ start: segmentStart, end: text.length });
        return text.length;
      }
      spans.push({ start: segmentStart, end: holeStart });
      const holeEnd = lexCode(text, holeStart, spans, holeDepth + 1);
      // A format, after the colon, is text up to the closing brace.
      segmentStart = holeEnd;
      i = holeEnd;
      if (text[i] === ":") {
        while (i < text.length && text[i] !== "}" && text[i] !== '"') {
          i++;
        }
      }
      if (text[i] === "}") {
        i += Math.min(runLength(text, i, "}"), raw ? dollars : 1);
      }
      continue;
    }
    i++;
  }
  const end = Math.min(i, text.length);
  spans.push({ start: segmentStart, end });
  return end;
};

/** The spans of the text that are comments, strings or character literals, in order. */
const ignoredSpans = (text: string): Span[] => {
  const spans: Span[] = [];
  lexCode(text, 0, spans, 0);
  return spans.filter((span) => span.end > span.start);
};

/**
 * For each offset of the text, the offset of the innermost open bracket around it, or -1. Built
 * in one pass over the code, skipping comments and strings, so brackets inside them don't count.
 */
const enclosingBrackets = (text: string, ignored: readonly Span[]) => {
  const enclosing = new Int32Array(text.length).fill(-1);
  const open: number[] = [];
  let next = 0;
  for (let i = 0; i < text.length; i++) {
    const span = ignored[next];
    if (span !== undefined && i >= span.start) {
      i = span.end - 1;
      next++;
      continue;
    }
    const character = text[i] ?? "";
    enclosing[i] = open[open.length - 1] ?? -1;
    if ("([{".includes(character)) {
      open.push(i);
    } else if (")]}".includes(character)) {
      open.pop();
    }
  }
  return enclosing;
};

/** Splits a parameter list on its top-level commas, leaving out empty entries. */
const splitParameters = (parameters: string) => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of parameters) {
    if ("([{<".includes(character)) {
      depth++;
    } else if (")]}>".includes(character)) {
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

/** The type name a type reads as, or null when it can't be read. */
const typeName = (type: string) => {
  const trimmed = type.trim();
  return dotnetTypeName.regex.test(trimmed) ? trimmed : null;
};

type ActivitySignature = Pick<
  ActivityFacts,
  "activity" | "input" | "output" | "runsAs"
>;

/** The input type: the type of the only parameter, or null with none or several. */
const readInput = (parameterList: string) => {
  const parameters = splitParameters(parameterList);
  const [only] = parameters;
  if (parameters.length !== 1 || only === undefined) {
    return null;
  }
  const type = dotnetParameter.regex.exec(only)?.[1];
  return type === undefined ? null : typeName(type);
};

/**
 * How the activity runs and what it returns. A task is async and its output is the task's
 * result type. Anything else is synchronous; `void` has no output.
 */
const readReturn = (
  returnType: string,
): Pick<ActivityFacts, "output" | "runsAs"> => {
  const type = returnType.trim();
  const task = dotnetTaskType.regex.exec(type);
  if (task !== null) {
    const result = task[1];
    return {
      runsAs: "async",
      output: result === undefined ? null : typeName(result),
    };
  }
  return { runsAs: "sync", output: type === "void" ? null : typeName(type) };
};

/** A pattern made sticky, so it is read exactly where `lastIndex` is placed. */
const stickyCopy = (pattern: Pattern) =>
  new RegExp(pattern.regex.source, `${pattern.regex.flags}y`);

/** Reads the method starting at `start`. Null when no method starts there. */
const readActivity = (
  source: Source,
  lineOf: LineOf,
  methodAt: RegExp,
  start: number,
): ActivitySignature | null => {
  methodAt.lastIndex = start;
  const match = methodAt.exec(source.text);
  if (match === null) {
    return null;
  }
  const [, before = "", returnType = "", name = "", parameterList = ""] = match;
  return {
    activity: { name, line: lineOf(start + before.length) },
    input: readInput(parameterList),
    ...readReturn(returnType),
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

/**
 * Detects .NET activities. The file-wide facts (non-retryable errors, configuration read,
 * dependencies and heartbeats) are read from the whole file and reported on every activity.
 */
export const dotnetDetector: Detector = {
  sdk: ".NET",
  sdkMarkers: [dotnetSdkUsing, dotnetActivityAttribute],
  activityMarkers: [dotnetActivityAttribute],
  detect(source) {
    const { text } = source;
    const lineOf = lineFinder(text);
    const ignored = ignoredSpans(text);
    const inCode = (match: RegExpExecArray) => !isInside(ignored, match.index);
    const found = (pattern: Pattern) =>
      allMatches(pattern, text).filter(inCode);

    const enclosing = enclosingBrackets(text, ignored);
    // The first nonRetryable: true directly inside each open bracket, by the bracket's offset.
    const nonRetryableArguments = new Map<number, number>();
    for (const match of found(dotnetNonRetryableArgument).reverse()) {
      nonRetryableArguments.set(enclosing[match.index] ?? -1, match.index);
    }
    const nonRetryableErrors: LineRef[] = found(
      dotnetNonRetryableThrow,
    ).flatMap((thrown) => {
      const argument = nonRetryableArguments.get(
        thrown.index + thrown[0].length - 1,
      );
      return argument === undefined ? [] : [{ line: lineOf(argument) }];
    });
    const configurationRead = firstByName(
      found(dotnetEnvironmentRead).map((match) => ({
        name: match[1] ?? "",
        line: lineOf(match.index),
      })),
    );
    const dependencies = firstByName(
      found(dotnetUsingDirective).flatMap((match) => {
        const root = match[1];
        return root === undefined || notDependencies.has(root)
          ? []
          : [{ name: root, line: lineOf(match.index) }];
      }),
    );
    const heartbeats: LineRef[] = found(dotnetHeartbeatCall).map((match) => ({
      line: lineOf(match.index + match[0].indexOf("Heartbeat")),
    }));

    const beforeMethodAt = stickyCopy(dotnetBeforeMethod);
    const methodAt = stickyCopy(dotnetActivityMethod);
    // An attribute within what was read before the previous attribute's method belongs to that
    // same method, so stacked attributes are one activity and are read once.
    let readUntil = -1;
    return found(dotnetActivityAttribute).flatMap((attribute) => {
      if (attribute.index < readUntil) {
        return [];
      }
      beforeMethodAt.lastIndex = attribute.index + attribute[0].length;
      beforeMethodAt.exec(text);
      readUntil = beforeMethodAt.lastIndex;
      const signature = readActivity(source, lineOf, methodAt, readUntil);
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
