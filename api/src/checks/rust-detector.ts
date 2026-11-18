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

// Rust detection (ADR 0008). Every pattern below is part of the published rubric. A match only
// counts when it starts in code: a match that starts inside a comment, a string or a character
// literal is ignored, so commented-out code and examples in doc comments are never detected.
//
// A Rust activity is a function marked #[activity], written inside an impl block marked
// #[activities], as Temporal's Rust SDK declares them. It takes the activity context, then at
// most one input, and returns a Result whose Ok type is its output.

/**
 * A `use` declaration of a Temporal Rust SDK crate, such as `use temporalio_sdk::activities;`.
 * The SDK's crates are all named `temporalio-…`, which a `use` path writes `temporalio_…`.
 */
export const rustSdkUse: Pattern = {
  name: "rust-sdk-use",
  description:
    "A use declaration of one of the Temporal Rust SDK's crates, such as use temporalio_sdk::activities::ActivityContext; or use temporalio_macros::activities;. The crates are published as temporalio-sdk, temporalio-macros and so on, and a use path writes the hyphens as underscores.",
  regex:
    /^[ \t]*(?:pub(?:[ \t]*\([^)\n]*\))?[ \t]+)?use[ \t]+(?:::)?[ \t]*temporalio_\w+\b/m,
};

/**
 * The `#[activity]` attribute, with or without arguments, such as `#[activity(name = "charge")]`.
 * It marks the function after it as a Temporal activity.
 */
export const rustActivityAttribute: Pattern = {
  name: "rust-activity-attribute",
  description:
    'The #[activity] attribute, with or without arguments, such as #[activity(name = "charge-card")]. It may be written #[temporalio_macros::activity]. It marks the function after it as a Temporal activity.',
  regex:
    /#[ \t]*\[[ \t]*(?:(?:::)?temporalio_macros[ \t]*::[ \t]*)?activity[ \t]*(?:\((?:[^()"\n]|"(?:[^"\\\n]|\\.)*")*\))?[ \t]*\]/,
};

/** The `#[activities]` attribute, which marks an impl block as declaring Temporal activities. */
export const rustActivitiesAttribute: Pattern = {
  name: "rust-activities-attribute",
  description:
    "The #[activities] attribute on an impl block, which declares the block's #[activity] functions as Temporal activities. It may be written #[temporalio_macros::activities].",
  regex:
    /#[ \t]*\[[ \t]*(?:(?:::)?temporalio_macros[ \t]*::[ \t]*)?activities[ \t]*\]/,
};

/**
 * What may sit between an activity attribute and its function: whitespace, comments and other
 * attributes. Read from the end of the attribute. It always matches, possibly nothing.
 */
export const rustBeforeFunction: Pattern = {
  name: "rust-before-function",
  description:
    "What may come between an #[activity] attribute and its function: whitespace, line, doc and block comments, and other attributes such as #[instrument].",
  regex:
    /(?:\s|#[ \t]*\[(?:[^[\]\n]|\[[^[\]\n]*\])*\]|\/\/[^\n]*|\/\*(?:[^*]|\*(?!\/))*(?:\*\/|$))*/,
};

/**
 * The function an activity attribute applies to, read starting exactly where
 * `rustBeforeFunction` ends, up to the opening parenthesis of its parameters. Groups: 1 `async`
 * when present, 2 its name. Rust writes the qualifiers in a fixed order: const, async, unsafe,
 * extern.
 */
export const rustActivityFunction: Pattern = {
  name: "rust-activity-function",
  description:
    "The function an #[activity] attribute applies to: its visibility, its qualifiers such as async, fn, and its name, then any generic parameters, up to its parameter list.",
  regex:
    /(?:pub(?:[ \t]*\([^)\n]*\))?\s+)?(?:const\s+)?(async\s+)?(?:unsafe\s+)?(?:extern(?:[ \t]+"[^"\n]*")?\s+)?fn\s+((?:r#)?[A-Za-z_]\w*)\s*(?:<(?:[^<>()]|<(?:[^<>()]|<[^<>()]*>)*>)*>\s*)?\(/,
};

/** The receiver of a method, such as `&self` or `self: Arc<Self>`. It is not an input. */
export const rustSelfParameter: Pattern = {
  name: "rust-self-parameter",
  description:
    "A method's receiver, such as self, &self, &mut self or self: Arc<Self>. It is not an input.",
  regex:
    /^(?:&[ \t]*(?:'[A-Za-z_]\w*[ \t]+)?)?(?:mut[ \t]+)?self(?:\s*:[\s\S]*)?$/,
};

/** One function parameter with its type, such as `input: ChargeRequest`. Group 1 is its type. */
export const rustParameter: Pattern = {
  name: "rust-parameter",
  description:
    "A function parameter with its type, such as input: ChargeRequest, mut input: ChargeRequest or _: String.",
  regex: /^(?:mut\s+)?(?:r#)?[A-Za-z_]\w*\s*:\s*([\s\S]+)$/,
};

/** The SDK's activity context type, which every activity takes before its input. */
export const rustActivityContextType: Pattern = {
  name: "rust-activity-context-type",
  description:
    "The activity context's type, ActivityContext, written alone or with its path, such as temporalio_sdk::activities::ActivityContext. The parameter of this type is the context, not the input.",
  regex: /^&?[ \t]*(?:(?:::)?[A-Za-z_]\w*\s*::\s*)*ActivityContext$/,
};

/**
 * The return type after a function's parameter list, read from just after its closing
 * parenthesis up to the body. Group 1 is the type, without a `where` clause.
 */
export const rustReturnType: Pattern = {
  name: "rust-return-type",
  description:
    "A function's return type after ->, such as -> Result<ChargeResult, ActivityError>, up to its body or its where clause. A function with no -> returns nothing.",
  regex: /^\s*->\s*([\s\S]*?)\s*(?:\bwhere\b[\s\S]*)?$/,
};

/**
 * A Result type, such as `Result<ChargeResult, ActivityError>` or `anyhow::Result<T>`. Group 1
 * is what is inside the angle brackets. The first type in it is the activity's output.
 */
export const rustResultType: Pattern = {
  name: "rust-result-type",
  description:
    "A Result return type, such as Result<ChargeResult, ActivityError>, written alone or with its path. The activity's output is its Ok type, the first type inside the angle brackets. An Ok type of () is no output.",
  regex: /^(?:(?:::)?[A-Za-z_]\w*\s*::\s*)*Result\s*<([\s\S]*)>$/,
};

/** A type that reads as a type name. Anything else is shown as unknown. */
export const rustTypeName: Pattern = {
  name: "rust-type-name",
  description:
    "A type that can be shown as a type name, such as ChargeRequest, models::ChargeRequest, String, Vec<u8> or Option<HashMap<String, u32>>, optionally a reference. Anything else, such as a tuple or an array, is shown as unknown.",
  regex:
    /^(?:&[ \t]*(?:'[A-Za-z_]\w*[ \t]+)?(?:mut[ \t]+)?)?(?:::)?[A-Za-z_]\w*(?:[ \t]*::[ \t]*[A-Za-z_]\w*)*(?:[ \t]*<[\w \t:,&'<>]*>)?$/,
};

/** The SDK's non-retryable application failure, such as `ApplicationFailure::non_retryable(`. */
export const rustNonRetryableFailure: Pattern = {
  name: "rust-non-retryable-failure",
  description:
    'A call to the SDK\'s ApplicationFailure::non_retryable(…), which makes a failure the activity returns non-retryable, such as Err(ApplicationFailure::non_retryable("Input too large").into()).',
  regex:
    /(?<![\w:])(?:[A-Za-z_]\w*\s*::\s*)*ApplicationFailure\s*::\s*non_retryable\s*\(/,
};

/** A builder setting that makes an application failure non-retryable: `.non_retryable(true)`. */
export const rustNonRetryableSetting: Pattern = {
  name: "rust-non-retryable-setting",
  description:
    "A call to .non_retryable(true) on an application failure's builder, which makes the failure non-retryable.",
  regex: /\.\s*non_retryable\s*\(\s*true\s*\)/,
};

/** The non-retryable activity error of earlier SDK versions: `ActivityError::NonRetryable(`. */
export const rustNonRetryableVariant: Pattern = {
  name: "rust-non-retryable-variant",
  description:
    "The ActivityError::NonRetryable(…) error of earlier Rust SDK versions, which fails the activity without a retry.",
  regex:
    /(?<![\w:])(?:[A-Za-z_]\w*\s*::\s*)*ActivityError\s*::\s*NonRetryable\s*\(/,
};

/** An environment variable read by name. Group 1 is the variable's name. */
export const rustEnvironmentRead: Pattern = {
  name: "rust-environment-read",
  description:
    'An environment variable read by name at run time: env::var("NAME") or env::var_os("NAME"), with or without the std:: prefix. The env! macro reads at build time and is not counted.',
  regex:
    /(?<![\w:])(?:(?:::)?std\s*::\s*)?env\s*::\s*var(?:_os)?\s*\(\s*"([A-Za-z_]\w*)"/,
};

/**
 * A `use` declaration. Group 1 is the crate, or module, its path starts from. A grouped
 * `use {a, b};` with no leading path is not read.
 */
export const rustUseDeclaration: Pattern = {
  name: "rust-use-declaration",
  description:
    "A use declaration, such as use stripe::Client;, use aws_sdk_s3::{Client, Config}; or pub use ::serde::Deserialize;. The dependency is the first part of the path. Paths that start from the code's own crate, crate::, self:: or super::, are not dependencies.",
  regex:
    /^[ \t]*(?:pub(?:[ \t]*\([^)\n]*\))?[ \t]+)?use[ \t]+(?:::)?[ \t]*((?:r#)?[A-Za-z_]\w*)\b/m,
};

/** An `extern crate` declaration. Group 1 is the crate. */
export const rustExternCrate: Pattern = {
  name: "rust-extern-crate",
  description:
    "An extern crate declaration, such as extern crate serde;. The dependency is the crate it names.",
  regex: /^[ \t]*extern[ \t]+crate[ \t]+([A-Za-z_]\w*)\b/m,
};

/** A heartbeat call on the activity context, such as `ctx.record_heartbeat(progress)`. */
export const rustHeartbeatCall: Pattern = {
  name: "rust-heartbeat-call",
  description:
    "A call to record_heartbeat on the activity context, with or without details, such as ctx.record_heartbeat(progress). The line reported is the line of record_heartbeat.",
  regex: /\.\s*record_heartbeat\s*\(/,
};

/**
 * A comment, a string literal or a character literal. Matches that start inside one are
 * ignored. An unterminated string or block comment runs to the end of the file.
 */
export const rustCommentOrString: Pattern = {
  name: "rust-comment-or-string",
  description:
    "A comment, a string literal or a character literal: // and /* */ comments, doc comments, strings, byte strings, raw strings such as r#\"…\"# and characters such as '{'. Nothing that starts inside one is detected, so commented-out code and examples inside strings are ignored. A block comment nested inside another ends the outer one early.",
  regex:
    /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|(?<!\w)b?r(#*)"[\s\S]*?(?:"\1|$)|(?<!\w)b?"(?:[^"\\]|\\[\s\S])*"?|(?<!\w)b?'(?:[^'\\\n]|\\(?:u\{[0-9A-Fa-f]{1,6}\}|x[0-9A-Fa-f]{2}|[^\n]))'/,
};

/** Every Rust pattern, as published in the rubric. */
export const rustPatterns: readonly Pattern[] = [
  rustSdkUse,
  rustActivityAttribute,
  rustActivitiesAttribute,
  rustBeforeFunction,
  rustActivityFunction,
  rustSelfParameter,
  rustParameter,
  rustActivityContextType,
  rustReturnType,
  rustResultType,
  rustTypeName,
  rustNonRetryableFailure,
  rustNonRetryableSetting,
  rustNonRetryableVariant,
  rustEnvironmentRead,
  rustUseDeclaration,
  rustExternCrate,
  rustHeartbeatCall,
  rustCommentOrString,
];

/**
 * The crates that ship with Rust itself, which Dependencies leaves out. A list rather than a
 * rule: the toolchain ships exactly these, and no prefix or shape tells them apart.
 */
const standardLibraryCrates: ReadonlySet<string> = new Set([
  "std",
  "core",
  "alloc",
  "proc_macro",
  "test",
]);

/** Whether a crate is one Rust itself ships: `std`, `core`, `alloc`, `proc_macro` or `test`. */
export const isRustStandardLibrary = (crate: string) =>
  standardLibraryCrates.has(crate);

/**
 * The integration key of a crate: lower-cased, with hyphens as underscores. Cargo.toml names a
 * crate with hyphens, such as `aws-sdk-s3`, and a `use` path with underscores, `aws_sdk_s3`, so
 * both give the same key.
 */
export const normaliseRustCrate = (crate: string) =>
  crate.toLowerCase().replaceAll("-", "_");

/** The prefix of the Temporal Rust SDK's own crates, which Dependencies leaves out. */
const temporalSdkCratePrefix = "temporalio_";

/** Path roots that name the code's own crate or module, never a dependency. */
const localPathRoots: ReadonlySet<string> = new Set([
  "crate",
  "self",
  "super",
  "Self",
]);

/**
 * The longest parameter list or return type read, in characters. Anything longer is not read,
 * so no pasted file can make detection slow.
 */
const longestReadable = 2000;

/** The spans of the text that are comments, strings or character literals, in order. */
const ignoredSpans = (text: string): Span[] =>
  allMatches(rustCommentOrString, text)
    .map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
    .filter((span) => span.end > span.start);

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
 * The code between `start` and `end` with its comments left out and every run of whitespace
 * made one space. Strings are kept as they are.
 */
const codeBetween = (
  text: string,
  ignored: readonly Span[],
  start: number,
  end: number,
) => {
  let code = "";
  let i = start;
  for (const span of ignored) {
    if (span.end <= start || span.start >= end) {
      continue;
    }
    code += text.slice(i, Math.max(i, span.start));
    const kept = text.slice(
      Math.max(start, span.start),
      Math.min(end, span.end),
    );
    code += kept.startsWith("/") ? " " : kept;
    i = Math.min(end, span.end);
  }
  code += text.slice(i, end);
  return code.replace(/\s+/g, " ").trim();
};

/**
 * Splits code on its top-level commas. Round, square, curly and angle brackets nest; the `>` of
 * an arrow `->` closes nothing. Empty pieces are left out.
 */
const splitTopLevel = (code: string) => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < code.length; i++) {
    const character = code[i] ?? "";
    if ("([{<".includes(character)) {
      depth++;
    } else if (")]}".includes(character)) {
      depth--;
    } else if (character === ">" && code[i - 1] !== "-") {
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

/** The type name a type reads as, or null when it can't be read or is `()`. */
const typeName = (type: string) => {
  const trimmed = type.trim();
  return rustTypeName.regex.test(trimmed) ? trimmed : null;
};

type ActivitySignature = Pick<
  ActivityFacts,
  "activity" | "input" | "output" | "runsAs"
>;

/**
 * The input type: the type of the only parameter after the receiver and the activity context.
 * Null with no such parameter or several.
 */
const readInput = (parameterList: string) => {
  const inputs = splitTopLevel(parameterList).filter(
    (parameter) => !rustSelfParameter.regex.test(parameter),
  );
  const types = inputs.map(
    (parameter) => rustParameter.regex.exec(parameter)?.[1]?.trim() ?? "",
  );
  const withoutContext = types.filter(
    (type) => !rustActivityContextType.regex.test(type),
  );
  const [only, ...rest] = withoutContext;
  return only === undefined || rest.length > 0 ? null : typeName(only);
};

/**
 * The output: the Ok type of a Result, or the return type itself. Null when the function
 * returns nothing, returns `()`, or its type can't be read.
 */
const readOutput = (signatureEnd: string) => {
  const returned = rustReturnType.regex.exec(signatureEnd)?.[1];
  if (returned === undefined || returned === "") {
    return null;
  }
  const result = rustResultType.regex.exec(returned);
  const type =
    result === null ? returned : (splitTopLevel(result[1] ?? "")[0] ?? "");
  return type.replace(/\s/g, "") === "()" ? null : typeName(type);
};

/** What the detector reads once per file, to share between its steps. */
interface Reading {
  readonly text: string;
  readonly ignored: readonly Span[];
  readonly closing: Int32Array;
  readonly lineOf: LineOf;
}

/**
 * A pattern made sticky, so it is read exactly where `lastIndex` is placed, with match indices
 * so a group's offset is known.
 */
const stickyCopy = (pattern: Pattern) =>
  new RegExp(pattern.regex.source, `${pattern.regex.flags}yd`);

/** Reads the function starting at `start`. Null when no function starts there. */
const readActivity = (
  reading: Reading,
  functionAt: RegExp,
  start: number,
): ActivitySignature | null => {
  const { text, ignored, closing, lineOf } = reading;
  functionAt.lastIndex = start;
  const match = functionAt.exec(text);
  if (match === null) {
    return null;
  }
  const [whole, isAsync, name = ""] = match;
  const openParenthesis = start + whole.length - 1;
  const closeParenthesis = closing[openParenthesis] ?? -1;
  const readable =
    closeParenthesis !== -1 &&
    closeParenthesis - openParenthesis <= longestReadable;
  const nameOffset = match.indices?.[2]?.[0] ?? start;
  const runsAs = isAsync === undefined ? "sync" : "async";
  if (!readable) {
    return {
      activity: { name, line: lineOf(nameOffset) },
      input: null,
      output: null,
      runsAs,
    };
  }
  const bodyOrEnd = text.slice(
    closeParenthesis + 1,
    closeParenthesis + 1 + longestReadable,
  );
  // The signature ends at the body's brace, or at a semicolon for a function without one.
  const signatureLength = bodyOrEnd.search(/[{;]/);
  const signatureEnd = codeBetween(
    text,
    ignored,
    closeParenthesis + 1,
    closeParenthesis +
      1 +
      (signatureLength === -1 ? bodyOrEnd.length : signatureLength),
  );
  return {
    activity: { name, line: lineOf(nameOffset) },
    input: readInput(
      codeBetween(text, ignored, openParenthesis + 1, closeParenthesis),
    ),
    output: readOutput(signatureEnd),
    runsAs,
  };
};

/** Each third-party crate a `use` or `extern crate` names, with the line of its first one. */
const readDependencies = (
  found: (pattern: Pattern) => RegExpExecArray[],
  lineOf: LineOf,
  isStandardLibrary: (name: string) => boolean,
): NamedLineRef[] =>
  firstByName(
    [rustUseDeclaration, rustExternCrate]
      .flatMap((pattern) => found(pattern))
      .sort((a, b) => a.index - b.index)
      .flatMap((match) => {
        const crate = (match[1] ?? "").replace(/^r#/, "");
        return crate === "" ||
          localPathRoots.has(crate) ||
          crate.startsWith(temporalSdkCratePrefix) ||
          isStandardLibrary(crate)
          ? []
          : [{ name: crate, line: lineOf(match.index) }];
      }),
  );

/**
 * How identification recognises Rust: a `use` of one of the SDK's crates, or the activity
 * attributes.
 */
export const rustRecognition: SdkRecognition = {
  sdkMarkers: [rustSdkUse, rustActivitiesAttribute, rustActivityAttribute],
  activityMarkers: [rustActivityAttribute],
  // Recognised only by its markers. A Rust activity can't be declared without them.
  shapeMarkers: [],
};

/**
 * Detects Rust activities. The file-wide facts (non-retryable errors, configuration read,
 * dependencies and heartbeats) are read from the whole file and reported on every activity.
 */
export const rustDetector: Detector = {
  detect(source, isStandardLibrary) {
    const { text } = source;
    const ignored = ignoredSpans(text);
    const enclosing = enclosingBrackets(text, ignored);
    const reading: Reading = {
      text,
      ignored,
      closing: closingBrackets(text, enclosing),
      lineOf: lineFinder(text),
    };
    const { lineOf } = reading;
    const inCode = (match: RegExpExecArray) => !isInside(ignored, match.index);
    const found = (pattern: Pattern) =>
      allMatches(pattern, text).filter(inCode);

    // Each non-retryable pattern, with the word whose line is reported.
    const nonRetryable: readonly [Pattern, string][] = [
      [rustNonRetryableFailure, "non_retryable"],
      [rustNonRetryableSetting, "non_retryable"],
      [rustNonRetryableVariant, "NonRetryable"],
    ];
    const nonRetryableErrors: LineRef[] = nonRetryable
      .flatMap(([pattern, word]) =>
        found(pattern).map((match) => match.index + match[0].lastIndexOf(word)),
      )
      .sort((a, b) => a - b)
      .map((offset) => ({ line: lineOf(offset) }));
    const configurationRead = firstByName(
      found(rustEnvironmentRead).map((match) => ({
        name: match[1] ?? "",
        line: lineOf(match.index),
      })),
    );
    const dependencies = readDependencies(found, lineOf, isStandardLibrary);
    const heartbeats: LineRef[] = found(rustHeartbeatCall).map((match) => ({
      line: lineOf(match.index + match[0].indexOf("record_heartbeat")),
    }));

    const beforeFunctionAt = stickyCopy(rustBeforeFunction);
    const functionAt = stickyCopy(rustActivityFunction);
    // An attribute within what was read before the previous attribute's function belongs to
    // that same function, so stacked attributes are one activity and are read once.
    let readUntil = -1;
    return found(rustActivityAttribute).flatMap((attribute) => {
      if (attribute.index < readUntil) {
        return [];
      }
      beforeFunctionAt.lastIndex = attribute.index + attribute[0].length;
      beforeFunctionAt.exec(text);
      readUntil = beforeFunctionAt.lastIndex;
      const signature = readActivity(reading, functionAt, readUntil);
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
