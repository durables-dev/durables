import type { Detector } from "./detector";
import type { ActivityFacts, LineRef, NamedLineRef, RunsAs } from "./facts";
import type { SdkRecognition } from "./identify";
import type { Pattern } from "./pattern";
import {
  allMatches,
  enclosingBrackets,
  firstByName,
  isInside,
  lineFinder,
  type LineOf,
  type Span,
} from "./scan";
import type { Source } from "./source";

// Ruby detection (ADR 0008). Every pattern below is part of the published rubric. A match only
// counts when it starts in code: a match that starts inside a comment, a string, a heredoc or
// a regular expression literal is ignored, so commented-out code and examples in strings are
// never detected. The holes of an interpolated string, the parts in #{}, are code and are
// detected.

/** A Ruby constant path, such as `ChargeCard` or `Billing::ChargeCard`. */
const rubyConstant = String.raw`(?:::)?[A-Z]\w*(?:::[A-Z]\w*)*`;

/** A `require` of the Temporal Ruby SDK, such as `require "temporalio/activity"`. */
export const rubySdkRequire: Pattern = {
  name: "ruby-sdk-require",
  description:
    'A require of the Temporal Ruby SDK, temporalio, such as require "temporalio/activity" or require "temporalio".',
  regex: /^[ \t]*require[ \t]*\(?[ \t]*(["'])temporalio(?:\/[\w/]*)?\1/m,
};

/**
 * A class that subclasses the SDK's activity definition, such as
 * `class ChargeCard < Temporalio::Activity::Definition`. Group 1 is the class's name.
 */
export const rubyActivityClass: Pattern = {
  name: "ruby-activity-class",
  description:
    "A class that subclasses Temporalio::Activity::Definition, such as class ChargeCard < Temporalio::Activity::Definition. The class is the Temporal activity, and its name is the activity's name.",
  regex: new RegExp(
    String.raw`^[ \t]*class[ \t]+(${rubyConstant})[ \t]*<[ \t]*(?:::)?Temporalio::Activity::Definition\b`,
    "m",
  ),
};

/**
 * The activity's `execute` method, the method Temporal calls. Group 1 is its parameters in
 * parentheses, group 2 its parameters without them.
 */
export const rubyExecuteMethod: Pattern = {
  name: "ruby-execute-method",
  description:
    "The activity class's execute method, such as def execute(input) or def execute input. Temporal calls it to run the activity.",
  regex:
    /^[ \t]*def[ \t]+execute\b(?![?!=])[ \t]*(?:\(((?:[^()]|\([^()]*\))*)\)|([^\n;#]*))/m,
};

/**
 * A Sorbet signature, `sig { ... }` or `sig do ... end`. Groups 1 and 2 are its body, in
 * braces or in a do block. It describes the method directly below it.
 */
export const rubySorbetSig: Pattern = {
  name: "ruby-sorbet-sig",
  description:
    "A Sorbet signature, sig { params(input: ChargeRequest).returns(ChargeResult) } or the same in a do … end block. A do block ends at the first line starting with end, and is not read past a line starting with def or sig. When it sits directly above execute, it gives the activity's input and output types.",
  regex:
    /^[ \t]*sig[ \t]*(?:\{([^{}]*)\}|do\b((?:(?!^[ \t]*(?:end|def|sig)\b)[\s\S])*)^[ \t]*end\b)/m,
};

/** What may sit between a Sorbet signature and its method: blank lines and comments. */
export const rubyBeforeMethod: Pattern = {
  name: "ruby-before-method",
  description:
    "What may come between a Sorbet signature and the execute method it describes: blank lines and comments.",
  regex: /^(?:\s|#[^\n]*)*$/,
};

/** The `params(...)` of a Sorbet signature. Group 1 is what is inside the parentheses. */
export const rubySigParams: Pattern = {
  name: "ruby-sig-params",
  description:
    "The params(…) of a Sorbet signature. With exactly one parameter, such as params(input: ChargeRequest), its type is the activity's input.",
  regex: /\bparams\s*\(((?:[^()]|\([^()]*\))*)\)/,
};

/** One parameter in a Sorbet `params(...)`, such as `input: ChargeRequest`. Group 1 is its type. */
export const rubySigParameter: Pattern = {
  name: "ruby-sig-parameter",
  description:
    "One parameter in a Sorbet params(…), such as input: ChargeRequest. The type follows the colon.",
  regex: /^\s*[a-z_]\w*\s*:\s*([\s\S]+?)\s*$/,
};

/** The `returns(...)` of a Sorbet signature. Group 1 is the output type. */
export const rubySigReturns: Pattern = {
  name: "ruby-sig-returns",
  description:
    "The returns(…) of a Sorbet signature, such as returns(ChargeResult). Its type is the activity's output. A signature ending in void has no output.",
  regex: /\breturns\s*\(((?:[^()]|\([^()]*\))*)\)/,
};

/** A type that reads as a type name. Anything else is shown as unknown. */
export const rubyTypeName: Pattern = {
  name: "ruby-type-name",
  description:
    "A Sorbet type that can be shown as a type name, such as ChargeRequest, Billing::ChargeRequest, String, T::Array[String] or T.nilable(ChargeRequest). Anything else is shown as unknown.",
  regex: new RegExp(
    String.raw`^(?:${rubyConstant}(?:\[[^\[\]\n]*(?:\[[^\[\]\n]*\][^\[\]\n]*)*\])?|T\.nilable\(\s*${rubyConstant}(?:\[[^\[\]\n]*\])?\s*\))$`,
  ),
};

/**
 * The activity runs on the fiber executor rather than Ruby's default thread pool:
 * `activity_executor :fiber`.
 */
export const rubyFiberExecutor: Pattern = {
  name: "ruby-fiber-executor",
  description:
    "activity_executor :fiber in the activity class. The activity then runs on a fiber, which needs the worker to run inside a fiber scheduler, so detection leaves Runs as blank. Without it, the activity runs on the SDK's default executor and is synchronous.",
  regex: /^[ \t]*activity_executor[ \t]*\(?[ \t]*:fiber\b/m,
};

/**
 * A raise of the SDK's application error, up to the opening parenthesis of its arguments, such
 * as `raise Temporalio::Error::ApplicationError.new(`. It counts when
 * `rubyNonRetryableArgument` is one of the arguments inside those parentheses.
 */
export const rubyNonRetryableRaise: Pattern = {
  name: "ruby-non-retryable-raise",
  description:
    "A raise (or fail) of the SDK's ApplicationError, such as raise Temporalio::Error::ApplicationError.new(…), with non_retryable: true among its own arguments in parentheses. The arguments may nest calls to any depth, and brackets inside strings are ignored. The line reported is the line of non_retryable: true.",
  regex:
    /(?<![\w.:])(?:raise|fail)[ \t]+(?:::)?(?:[A-Z]\w*::)*ApplicationError[ \t]*\.[ \t]*new[ \t]*\(/,
};

/** The `non_retryable: true` keyword argument, as read inside a raised application error. */
export const rubyNonRetryableArgument: Pattern = {
  name: "ruby-non-retryable-argument",
  description:
    "The keyword argument non_retryable: true, or :non_retryable => true. It marks an error as non-retryable only when it is an argument of the raised ApplicationError itself, not of a call nested inside it.",
  regex:
    /(?:(?<![\w.@:])non_retryable:|(?<![\w:]):non_retryable\s*=>)\s*true\b/,
};

/** An environment variable read by name. Group 2 is the variable's name. */
export const rubyEnvironmentRead: Pattern = {
  name: "ruby-environment-read",
  description:
    'An environment variable read by name: ENV["NAME"] or ENV.fetch("NAME"), with or without parentheses or a default.',
  regex:
    /(?<![\w.:])(?:::)?ENV\s*(?:\[\s*|\.\s*fetch(?:\s*\(\s*|[ \t]+))(["'])([A-Za-z_]\w*)\1/,
};

/**
 * A `require` of a library by name, at the start of a line or after a semicolon. Group 2 is
 * the name required. `require_relative` loads the project's own files and is not a require.
 */
export const rubyRequire: Pattern = {
  name: "ruby-require",
  description:
    'A require of a library, such as require "stripe" or require("aws-sdk-s3"). The dependency is the name required. require_relative, and a require of a path starting with . or /, loads the project\'s own files and is not a dependency.',
  regex: /(?:^|;)[ \t]*require[ \t]*\(?[ \t]*(["'])([^"'\n]+)\1/m,
};

/** A heartbeat call, such as `Temporalio::Activity::Context.current.heartbeat`. */
export const rubyHeartbeatCall: Pattern = {
  name: "ruby-heartbeat-call",
  description:
    "A call to heartbeat on the activity's context, with or without details or parentheses, such as Temporalio::Activity::Context.current.heartbeat or context.heartbeat(progress).",
  regex: /\.[ \t]*heartbeat(?![\w?!])(?![ \t]*=(?![=~]))/,
};

/** A block comment: from `=begin` at the start of a line to `=end` at the start of a line. */
export const rubyBlockComment: Pattern = {
  name: "ruby-block-comment",
  description:
    "A block comment, from =begin at the start of a line to =end at the start of a line. Nothing inside it is detected.",
  regex: /^=begin\b[\s\S]*?(?:^=end\b[^\n]*|(?![\s\S]))/m,
};

/**
 * The opening of a heredoc, such as `<<~SQL`. Group 2 is the quote, if any, and group 3 the
 * terminator. Its body starts on the next line.
 */
export const rubyHeredocStart: Pattern = {
  name: "ruby-heredoc-start",
  description:
    "The opening of a heredoc, such as <<~SQL, <<-EOS or <<~'TEXT'. Its body, from the next line to the line holding only the terminator, is text and nothing inside it is detected.",
  regex: /<<([~-]?)(["'`]?)([A-Za-z_]\w*)\2/,
};

/** Every Ruby pattern, as published in the rubric. */
export const rubyPatterns: readonly Pattern[] = [
  rubySdkRequire,
  rubyActivityClass,
  rubyExecuteMethod,
  rubySorbetSig,
  rubyBeforeMethod,
  rubySigParams,
  rubySigParameter,
  rubySigReturns,
  rubyTypeName,
  rubyFiberExecutor,
  rubyNonRetryableRaise,
  rubyNonRetryableArgument,
  rubyEnvironmentRead,
  rubyRequire,
  rubyHeartbeatCall,
  rubyBlockComment,
  rubyHeredocStart,
];

/** The Temporal SDK's own gem, which Dependencies leaves out. */
const temporalSdkGem = "temporalio";

/** Characters after which a `/` starts a regular expression literal rather than a division. */
const beforeRegex = new Set([
  "",
  "(",
  ",",
  "=",
  "~",
  "!",
  "[",
  "{",
  "|",
  "&",
  ";",
  "?",
  ":",
]);

/** Words after which a `/` starts a regular expression literal rather than a division. */
const keywordsBeforeRegex = new Set([
  "when",
  "if",
  "elsif",
  "unless",
  "while",
  "until",
  "and",
  "or",
  "not",
  "return",
]);

/** Closing delimiters for the bracketing delimiters of a percent literal. */
const closingDelimiter: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
};

/**
 * How deeply interpolated strings may nest inside each other's holes. Past it, the rest of the
 * file is read as string, so a pathological paste can't exhaust the stack.
 */
const maxInterpolationDepth = 16;

/** A heredoc whose opener has been read and whose body starts at the next line break. */
interface PendingHeredoc {
  readonly terminator: string;
  readonly indented: boolean;
}

/** Whether a `/` at `at` starts a regular expression literal, judged from what precedes it. */
const startsRegex = (text: string, at: number) => {
  let before = at - 1;
  while (before >= 0 && (text[before] === " " || text[before] === "\t")) {
    before--;
  }
  const previous = before < 0 ? "" : (text[before] ?? "");
  if (previous === "\n" || beforeRegex.has(previous)) {
    return true;
  }
  const word = /\w+$/.exec(text.slice(Math.max(0, before - 10), before + 1));
  return word !== null && keywordsBeforeRegex.has(word[0]);
};

/**
 * Reads a quoted body from `start`, just after its opening delimiter, to its closing one.
 * Pushes the spans of its text; when `interpolates`, the `#{}` holes are left out and read as
 * code. Returns the offset after the closing delimiter, or the end of the text.
 */
const lexQuoted = (
  text: string,
  literalStart: number,
  start: number,
  open: string,
  close: string,
  interpolates: boolean,
  spans: Span[],
  holeDepth: number,
): number => {
  let segmentStart = literalStart;
  let nesting = 0;
  let i = start;
  while (i < text.length) {
    const character = text[i];
    if (character === "\\") {
      i += 2;
      continue;
    }
    if (open !== close && character === open) {
      nesting++;
    } else if (character === close) {
      if (nesting === 0) {
        spans.push({ start: segmentStart, end: i + 1 });
        return i + 1;
      }
      nesting--;
    } else if (interpolates && character === "#" && text[i + 1] === "{") {
      if (holeDepth >= maxInterpolationDepth) {
        spans.push({ start: segmentStart, end: text.length });
        return text.length;
      }
      spans.push({ start: segmentStart, end: i + 2 });
      const holeEnd = lexCode(text, i + 2, spans, holeDepth + 1);
      segmentStart = holeEnd;
      i = holeEnd + 1;
      continue;
    }
    i++;
  }
  spans.push({ start: segmentStart, end: text.length });
  return text.length;
};

/**
 * Skips the bodies of the heredocs opened on the line that ends at `lineBreak`. Each body runs
 * from the next line to the line holding only its terminator. Returns where code resumes.
 */
const skipHeredocs = (
  text: string,
  lineBreak: number,
  pending: readonly PendingHeredoc[],
  spans: Span[],
) => {
  let at = lineBreak + 1;
  for (const { terminator, indented } of pending) {
    const bodyStart = at;
    let end = text.length;
    while (at < text.length) {
      const next = text.indexOf("\n", at);
      const lineEnd = next === -1 ? text.length : next;
      const line = text.slice(at, lineEnd);
      at = lineEnd + 1;
      if ((indented ? line.trim() : line) === terminator) {
        end = lineEnd;
        break;
      }
    }
    spans.push({ start: bodyStart, end: Math.min(end, text.length) });
  }
  return Math.min(at - 1, text.length);
};

/**
 * Finds where the comments, strings, heredocs and regular expression literals of Ruby code
 * are, so matches inside them can be ignored. Reads `text` as code from `start`. Inside an
 * interpolation hole, at `holeDepth` 1 or more, it stops at the hole's closing brace and
 * returns that offset; at 0 it reads to the end. Each span found is pushed to `spans`, in
 * order. Reading Ruby this way is deliberately approximate; it covers the forms activity code
 * uses.
 */
const lexCode = (
  text: string,
  start: number,
  spans: Span[],
  holeDepth: number,
): number => {
  const inHole = holeDepth > 0;
  const heredocStart = new RegExp(rubyHeredocStart.regex.source, "y");
  const blockComment = new RegExp(rubyBlockComment.regex.source, "my");
  let pending: PendingHeredoc[] = [];
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const character = text[i] ?? "";
    const next = text[i + 1];
    const atLineStart = i === 0 || text[i - 1] === "\n";
    if (character === "\n" && pending.length > 0) {
      i = skipHeredocs(text, i, pending, spans);
      pending = [];
      continue;
    }
    if (inHole) {
      if (character === "}" && depth === 0) {
        return i;
      }
      if (character === "{") {
        depth++;
      } else if (character === "}") {
        depth--;
      }
    }
    if (atLineStart && character === "=") {
      blockComment.lastIndex = i;
      const comment = blockComment.exec(text);
      if (comment !== null) {
        spans.push({ start: i, end: i + comment[0].length });
        i += comment[0].length;
        continue;
      }
    }
    if (character === "#") {
      const newline = text.indexOf("\n", i);
      const end = newline === -1 ? text.length : newline;
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    if (character === "<" && next === "<") {
      heredocStart.lastIndex = i;
      const opener = heredocStart.exec(text);
      if (
        opener !== null &&
        (opener[1] !== "" ||
          opener[2] !== "" ||
          /[A-Z]/.test(opener[3]?.[0] ?? ""))
      ) {
        pending.push({
          terminator: opener[3] ?? "",
          indented: opener[1] !== "",
        });
        i += opener[0].length;
        continue;
      }
    }
    if (character === "'") {
      i = lexQuoted(text, i, i + 1, "'", "'", false, spans, holeDepth);
      continue;
    }
    if (character === '"' || character === "`") {
      i = lexQuoted(
        text,
        i,
        i + 1,
        character,
        character,
        true,
        spans,
        holeDepth,
      );
      continue;
    }
    if (character === "/" && startsRegex(text, i)) {
      i = lexQuoted(text, i, i + 1, "/", "/", true, spans, holeDepth);
      continue;
    }
    if (character === "%" && next !== undefined && "qQwWiIr".includes(next)) {
      const delimiter = text[i + 2] ?? "";
      if (delimiter !== "" && !/[\w\s]/.test(delimiter)) {
        const close = closingDelimiter[delimiter] ?? delimiter;
        const interpolates = "QWIr".includes(next);
        i = lexQuoted(
          text,
          i,
          i + 3,
          delimiter,
          close,
          interpolates,
          spans,
          holeDepth,
        );
        continue;
      }
    }
    i++;
  }
  return i;
};

/** The spans of the text that are comments, strings, heredocs or regular expressions, in order. */
const ignoredSpans = (text: string): Span[] => {
  const spans: Span[] = [];
  lexCode(text, 0, spans, 0);
  return spans
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start);
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

/** The type name a Sorbet type reads as, or null when it can't be read. */
const typeName = (type: string) => {
  const trimmed = type.trim();
  return rubyTypeName.regex.test(trimmed) ? trimmed : null;
};

/** The input and output a Sorbet signature body gives, each null when it gives none. */
const readSignature = (
  body: string,
): Pick<ActivityFacts, "input" | "output"> => {
  const parameters = splitParameters(rubySigParams.regex.exec(body)?.[1] ?? "");
  const [only] = parameters;
  const inputType =
    parameters.length === 1 && only !== undefined
      ? rubySigParameter.regex.exec(only)?.[1]
      : undefined;
  const outputType = rubySigReturns.regex.exec(body)?.[1];
  return {
    input: inputType === undefined ? null : typeName(inputType),
    output: outputType === undefined ? null : typeName(outputType),
  };
};

type ActivitySignature = Pick<
  ActivityFacts,
  "activity" | "input" | "output" | "runsAs"
>;

/** What the activity classes are read from: every match, in code, of the patterns inside them. */
interface ClassContents {
  readonly executes: readonly RegExpExecArray[];
  readonly signatures: readonly RegExpExecArray[];
  readonly fiberExecutors: readonly RegExpExecArray[];
}

/** The matches that start after `start` and before `end`. */
const between = (
  matches: readonly RegExpExecArray[],
  start: number,
  end: number,
) => matches.filter(({ index }) => index > start && index < end);

/**
 * Reads one activity class: its name, the input and output its `execute` method's Sorbet
 * signature gives, and how it runs. `end` is where the next activity class starts, or the end
 * of the text.
 */
const readActivity = (
  text: string,
  lineOf: LineOf,
  contents: ClassContents,
  activityClass: RegExpExecArray,
  end: number,
): ActivitySignature => {
  const start = activityClass.index;
  const [execute] = between(contents.executes, start, end);
  const signature =
    execute === undefined
      ? undefined
      : between(contents.signatures, start, execute.index)
          .filter(
            (sig) =>
              sig.index + sig[0].length <= execute.index &&
              rubyBeforeMethod.regex.test(
                text.slice(sig.index + sig[0].length, execute.index),
              ),
          )
          .pop();
  const runsAs: RunsAs =
    between(contents.fiberExecutors, start, end).length > 0 ? null : "sync";
  const name = (activityClass[1] ?? "").replace(/^::/, "");
  return {
    activity: { name, line: lineOf(start) },
    ...(signature === undefined
      ? { input: null, output: null }
      : readSignature(signature[1] ?? signature[2] ?? "")),
    runsAs,
  };
};

/** Each third-party gem required, with the line of its first require. */
const readDependencies = (
  lineOf: LineOf,
  found: (pattern: Pattern) => RegExpExecArray[],
  isStandardLibrary: (name: string) => boolean,
): NamedLineRef[] =>
  firstByName(
    found(rubyRequire).flatMap((match) => {
      const name = (match[2] ?? "").trim();
      const gem = name.split("/")[0] ?? "";
      return name === "" ||
        /^[./~]/.test(name) ||
        gem === temporalSdkGem ||
        isStandardLibrary(name)
        ? []
        : [{ name, line: lineOf(match.index + match[0].indexOf("require")) }];
    }),
  );

/** How identification recognises Ruby: the SDK require or the activity class. */
export const rubyRecognition: SdkRecognition = {
  sdkMarkers: [rubySdkRequire, rubyActivityClass],
  activityMarkers: [rubyActivityClass],
  // Recognised only by its markers. A Ruby activity is always a Temporalio class.
  shapeMarkers: [],
};

/**
 * Detects Ruby activities: one per class that subclasses `Temporalio::Activity::Definition`.
 * The file-wide facts (non-retryable errors, configuration read, dependencies and heartbeats)
 * are read from the whole file and reported on every activity.
 */
export const rubyDetector: Detector = {
  detect(source: Source, isStandardLibrary) {
    const { text } = source;
    const lineOf = lineFinder(text);
    const ignored = ignoredSpans(text);
    const inCode = (match: RegExpExecArray) => !isInside(ignored, match.index);
    const found = (pattern: Pattern) =>
      allMatches(pattern, text).filter(inCode);

    const enclosing = enclosingBrackets(text, ignored);
    // The first non_retryable: true directly inside each open bracket, by the bracket's offset.
    const nonRetryableArguments = new Map<number, number>();
    for (const match of found(rubyNonRetryableArgument).reverse()) {
      nonRetryableArguments.set(enclosing[match.index] ?? -1, match.index);
    }
    const nonRetryableErrors: LineRef[] = found(rubyNonRetryableRaise).flatMap(
      (raise) => {
        const argument = nonRetryableArguments.get(
          raise.index + raise[0].length - 1,
        );
        return argument === undefined ? [] : [{ line: lineOf(argument) }];
      },
    );
    const configurationRead = firstByName(
      found(rubyEnvironmentRead).map((match) => ({
        name: match[2] ?? "",
        line: lineOf(match.index),
      })),
    );
    const dependencies = readDependencies(lineOf, found, isStandardLibrary);
    const heartbeats: LineRef[] = found(rubyHeartbeatCall).map((match) => ({
      line: lineOf(match.index + match[0].indexOf("heartbeat")),
    }));

    const contents: ClassContents = {
      executes: found(rubyExecuteMethod),
      signatures: found(rubySorbetSig),
      fiberExecutors: found(rubyFiberExecutor),
    };
    const classes = found(rubyActivityClass);
    return classes.map((activityClass, index) => ({
      ...readActivity(
        text,
        lineOf,
        contents,
        activityClass,
        classes[index + 1]?.index ?? text.length,
      ),
      nonRetryableErrors,
      configurationRead,
      dependencies,
      heartbeats,
    }));
  },
};
