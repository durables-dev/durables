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

// PHP detection (ADR 0008). Every pattern below is part of the published rubric. A match only
// counts when it starts in code: a match that starts inside a comment, a string, a heredoc or a
// nowdoc is ignored, so commented-out code and examples in strings are never detected.
//
// An activity is a public, non-static method of a type marked #[ActivityInterface], whether the
// type is an interface or a class. Methods whose names start with two underscores are PHP's
// magic methods, such as __construct, and are never activities.

/** A PHP `use` of the Temporal SDK's namespace, such as `use Temporal\Activity\ActivityInterface;`. */
export const phpSdkUse: Pattern = {
  name: "php-sdk-use",
  description:
    "A PHP use statement for the Temporal SDK's Temporal namespace, such as use Temporal\\Activity\\ActivityInterface.",
  regex: /^[ \t]*use[ \t]+\\?Temporal\\/m,
};

/** A PHP activity attribute or annotation: `ActivityInterface` or `ActivityMethod`. */
export const phpActivityAttribute: Pattern = {
  name: "php-activity-attribute",
  description:
    "The #[ActivityInterface] or #[ActivityMethod] attribute, or the same name as a docblock annotation, on a PHP interface or method.",
  regex: /(?:#\[[ \t]*|@)Activity(?:Interface|Method)\b/,
};

/**
 * The `#[ActivityInterface]` attribute at the start of a line, with or without arguments. It
 * may share its brackets with other attributes, such as `#[Deprecated, ActivityInterface]`.
 */
export const phpActivityInterfaceAttribute: Pattern = {
  name: "php-activity-interface-attribute",
  description:
    'The #[ActivityInterface] attribute at the start of a line, with or without arguments, such as #[ActivityInterface(prefix: "Billing.")]. It may be written with its namespace, as #[\\Temporal\\Activity\\ActivityInterface], and may share its brackets with other attributes. It marks the interface or class below it as declaring activities.',
  regex:
    /^[ \t]*#\[(?:[^\]\n]*?,[ \t]*)?\\?(?:Temporal\\Activity\\)?ActivityInterface[ \t]*(?:\((?:[^()"'\n]|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')*\))?[ \t]*(?:,[^\]\n]*)?\]/m,
};

/**
 * What may sit between the activity attribute and its interface or class: whitespace,
 * comments and other attributes. Read from the end of the attribute. It always matches,
 * possibly nothing, and a block comment ends at its first closing mark.
 */
export const phpBeforeType: Pattern = {
  name: "php-before-type",
  description:
    "What may come between an #[ActivityInterface] attribute and its interface or class: whitespace, line, hash and block comments, and other attributes such as #[Deprecated].",
  regex:
    /(?:\s|#\[[^\]\n]*\]|\/\/[^\n]*|#(?!\[)[^\n]*|\/\*(?:[^*]|\*(?!\/))*(?:\*\/|$))*/,
};

/**
 * The interface or class the activity attribute applies to, read starting exactly where
 * `phpBeforeType` ends, up to the brace that opens its body. Group 1 is its name.
 */
export const phpActivityType: Pattern = {
  name: "php-activity-type",
  description:
    "The interface or class an #[ActivityInterface] attribute applies to, with any final, abstract or readonly modifier, up to the brace that opens its body.",
  regex:
    /(?:(?:final|abstract|readonly)\s+)*(?:interface|class)\s+([A-Za-z_]\w*)[^{;]*\{/i,
};

/**
 * A named method declaration, up to the parenthesis that opens its parameters. Group 1 is its
 * modifiers, group 2 its name.
 */
export const phpMethod: Pattern = {
  name: "php-method",
  description:
    "A method declaration with its modifiers and its name, such as public function chargeCard( or function greet(. A method with no visibility modifier is public.",
  regex:
    /(?<![\w$\\])((?:(?:public|protected|private|static|abstract|final)\s+)*)function\s+&?\s*([A-Za-z_]\w*)\s*\(/i,
};

/** Modifiers that keep a method from being an activity. */
const notActivityModifier = /\b(?:private|protected|static)\b/i;

/**
 * A PHP type as written: a name or namespaced name, optionally nullable with `?`, or a union
 * or intersection of names.
 */
const phpTypeSource = String.raw`\??\\?[A-Za-z_][\w\\]*(?:[ \t]*[|&][ \t]*\\?[A-Za-z_][\w\\]*)*`;

/**
 * One method parameter, such as `ChargeRequest $request`, optionally with attributes, a
 * promoted-property modifier, a reference or variadic mark and a default value. Group 1 is its
 * type, absent when it has none. Group 2 is the variadic mark.
 */
export const phpParameter: Pattern = {
  name: "php-parameter",
  description:
    "One method parameter with its type, such as ChargeRequest $request or ?string $note = null, optionally with attributes, a modifier such as readonly, and & or ... before the variable.",
  regex: new RegExp(
    String.raw`^(?:#\[[^\]]*\]\s*)*(?:(?:public|protected|private|readonly)\s+)*(?:(${phpTypeSource})\s+)?&?\s*(\.\.\.)?\s*\$[A-Za-z_]\w*\s*(?:=[\s\S]*)?$`,
  ),
};

/** A type that reads as a type name. Anything else is shown as unknown. */
export const phpTypeName: Pattern = {
  name: "php-type-name",
  description:
    "A type that can be shown as a type name, such as ChargeRequest, App\\Models\\ChargeRequest, ?string or int|string. Anything else is shown as unknown.",
  regex: new RegExp(`^${phpTypeSource}$`),
};

/**
 * A method's return type, read from just after its closing parenthesis. Group 1 is the type.
 */
export const phpReturnType: Pattern = {
  name: "php-return-type",
  description:
    "A method's return type, after the colon that follows its parameters, such as : ChargeResult or : ?string. The output is that type. void, never and null have no output to show.",
  regex: new RegExp(String.raw`\s*:\s*(${phpTypeSource})`),
};

/** Return types that have no output to show. */
const noOutput = new Set(["void", "never", "null"]);

/**
 * A throw of the SDK's application failure, up to the opening parenthesis of its arguments,
 * such as `throw new ApplicationFailure(`. It counts when the failure is made non-retryable
 * among those arguments.
 */
export const phpNonRetryableThrow: Pattern = {
  name: "php-non-retryable-throw",
  description:
    "A throw of the SDK's ApplicationFailure, with or without its namespace, made non-retryable by its own arguments: true as the third argument, $nonRetryable, or the named argument nonRetryable: true. The line reported is the line of that true.",
  regex:
    /(?<![\w$\\])throw\s+new\s+\\?(?:[A-Za-z_]\w*\\)*ApplicationFailure\s*\(/,
};

/** The `nonRetryable: true` named argument, as read inside a thrown application failure. */
export const phpNonRetryableArgument: Pattern = {
  name: "php-non-retryable-argument",
  description:
    "The named argument nonRetryable: true. It marks a failure as non-retryable only when it is an argument of the thrown ApplicationFailure itself.",
  regex: /^nonRetryable\s*:\s*(?:true|TRUE|True)$/,
};

/**
 * `true` as an argument on its own. As ApplicationFailure's third positional argument, it is
 * `$nonRetryable`.
 */
export const phpTrueArgument: Pattern = {
  name: "php-true-argument",
  description:
    "The value true as a positional argument. As the third argument of a thrown ApplicationFailure, which is $nonRetryable, it marks the failure as non-retryable.",
  regex: /^(?:true|TRUE|True)$/,
};

/**
 * An environment variable read by name: `getenv('NAME')` or `$_ENV['NAME']`. Groups 1 to 4
 * hold the variable's name; one of them is set.
 */
export const phpEnvironmentRead: Pattern = {
  name: "php-environment-read",
  description:
    "An environment variable read by name: getenv('NAME') or $_ENV['NAME'], with single or double quotes.",
  regex:
    /(?<![\w$\\>:])\\?getenv\s*\(\s*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)")|\$_ENV\s*\[\s*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)")\s*\]/,
};

/**
 * A `use` import statement at the start of a line, for classes, functions or constants.
 * Group 1 is the list of names it imports. A closure's `use ($x)` does not match.
 */
export const phpUseStatement: Pattern = {
  name: "php-use-statement",
  description:
    "A use statement that imports names from a namespace, such as use Stripe\\StripeClient;, use function GuzzleHttp\\Psr7\\stream_for; or use Aws\\S3\\{S3Client, Exception\\S3Exception};. A use inside a class body imports a trait and is not a dependency.",
  regex: /^[ \t]*use[ \t]+(?:(?:function|const)[ \t]+)?(\\?[A-Za-z_][^;]*);/m,
};

/**
 * One name in a `use` statement's list, such as `Stripe\StripeClient as Client`, or a group
 * such as `Aws\S3\{S3Client, S3MultiRegionClient}`. Group 1 is the namespaced name, group 2 the
 * names inside a group's braces.
 */
export const phpImportedName: Pattern = {
  name: "php-imported-name",
  description:
    "One name imported by a use statement, such as Stripe\\StripeClient or Stripe\\StripeClient as Client, or a group such as Aws\\S3\\{S3Client, S3MultiRegionClient}.",
  regex:
    /^(?:(?:function|const)\s+)?\\?([A-Za-z_]\w*(?:\\[A-Za-z_]\w*)*)(?:\\\s*\{([^}]*)\})?(?:\s+as\s+[A-Za-z_]\w*)?$/,
};

/** A `namespace` declaration. Group 1 is the root of the namespace the file declares. */
export const phpNamespaceDeclaration: Pattern = {
  name: "php-namespace-declaration",
  description:
    "The file's namespace declaration, such as namespace App\\Activities;. Names imported from the same root namespace are the project's own code, not dependencies.",
  regex: /^[ \t]*namespace[ \t]+([A-Za-z_]\w*)/m,
};

/**
 * A heartbeat call, such as `Activity::heartbeat($progress)`, from the `::` or `->`. The line
 * reported is the line of `heartbeat`.
 */
export const phpHeartbeatCall: Pattern = {
  name: "php-heartbeat-call",
  description:
    "A call to heartbeat on the SDK's Activity class or on the activity's context, with or without details, such as Activity::heartbeat($progress).",
  regex: /(?:::|->)\s*heartbeat\s*\(/i,
};

/**
 * The start of a heredoc or nowdoc, such as `<<<SQL` or `<<<'SQL'`, read where `<<<` is
 * found. Group 2 is its closing identifier. What follows, up to that identifier at the start of
 * a line, is text, not code.
 */
export const phpHeredocStart: Pattern = {
  name: "php-heredoc-start",
  description:
    "The start of a heredoc or nowdoc, such as <<<SQL or <<<'SQL'. Everything up to its closing identifier is text, so nothing in it is detected.",
  regex: /<<<[ \t]*(["']?)([A-Za-z_]\w*)\1[ \t]*\n/,
};

/**
 * The end of the text before a brace that opens a braced namespace block, such as
 * `namespace App {`. A use statement directly inside such a block is an import.
 */
export const phpNamespaceBlock: Pattern = {
  name: "php-namespace-block",
  description:
    "A braced namespace block, such as namespace App { or namespace {. A use statement directly inside one imports names; a use inside a class body imports a trait.",
  regex: /namespace(?:\s+[A-Za-z_][\w\\]*)?\s*$/,
};

/** Every PHP pattern, as published in the rubric. */
export const phpPatterns: readonly Pattern[] = [
  phpSdkUse,
  phpActivityAttribute,
  phpActivityInterfaceAttribute,
  phpBeforeType,
  phpActivityType,
  phpMethod,
  phpParameter,
  phpTypeName,
  phpReturnType,
  phpNonRetryableThrow,
  phpNonRetryableArgument,
  phpTrueArgument,
  phpEnvironmentRead,
  phpUseStatement,
  phpImportedName,
  phpNamespaceDeclaration,
  phpHeartbeatCall,
  phpHeredocStart,
  phpNamespaceBlock,
];

/** The root namespace of the Temporal PHP SDK, which Dependencies leaves out. */
const temporalSdkNamespace = "temporal";

/** A pattern made sticky, so it is read exactly where `lastIndex` is placed. */
const stickyCopy = (pattern: Pattern) =>
  new RegExp(pattern.regex.source, `${pattern.regex.flags}y`);

/** Where the heredoc or nowdoc that opens at `start` ends, or null when none opens there. */
const heredocEnd = (text: string, start: number): number | null => {
  const opening = stickyCopy(phpHeredocStart);
  opening.lastIndex = start;
  const match = opening.exec(text);
  if (match === null) {
    return null;
  }
  const closing = new RegExp(`^[ \\t]*${match[2] ?? ""}(?![A-Za-z0-9_])`, "gm");
  closing.lastIndex = opening.lastIndex;
  const close = closing.exec(text);
  return close === null ? text.length : close.index + close[0].length;
};

/** Where the quoted string that opens at `start` ends: after its closing quote, or the text's end. */
const quotedEnd = (text: string, start: number) => {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length && text[i] !== quote) {
    i += text[i] === "\\" ? 2 : 1;
  }
  return Math.min(text.length, i + 1);
};

/**
 * The spans of the text that are comments, strings, heredocs or nowdocs, in order. A `#` that
 * opens an attribute, `#[`, is code. A double-quoted string's interpolated variables are read
 * as part of the string.
 */
const ignoredSpans = (text: string): Span[] => {
  const spans: Span[] = [];
  let i = 0;
  while (i < text.length) {
    const character = text[i];
    const next = text[i + 1];
    let end: number | null = null;
    if (
      (character === "/" && next === "/") ||
      (character === "#" && next !== "[")
    ) {
      const newline = text.indexOf("\n", i);
      end = newline === -1 ? text.length : newline;
    } else if (character === "/" && next === "*") {
      const close = text.indexOf("*/", i + 2);
      end = close === -1 ? text.length : close + 2;
    } else if (character === "'" || character === '"' || character === "`") {
      end = quotedEnd(text, i);
    } else if (character === "<" && text.startsWith("<<<", i)) {
      end = heredocEnd(text, i);
    }
    if (end === null) {
      i++;
      continue;
    }
    spans.push({ start: i, end });
    i = end;
  }
  return spans;
};

/** The offset of the bracket that closes the one opened at `open`, or the text's length. */
const closingBracket = (text: string, enclosing: Int32Array, open: number) => {
  for (let i = open + 1; i < text.length; i++) {
    if (enclosing[i] === open && ")]}".includes(text[i] ?? "")) {
      return i;
    }
  }
  return text.length;
};

/** One argument or parameter in a bracketed list, and where its text starts. */
interface ListEntry {
  readonly text: string;
  readonly start: number;
}

/** The entries of the list in the bracket opened at `open`, split on its own commas. */
const listEntries = (
  text: string,
  enclosing: Int32Array,
  open: number,
): ListEntry[] => {
  const close = closingBracket(text, enclosing, open);
  const entries: ListEntry[] = [];
  let start = open + 1;
  for (let i = open + 1; i <= close; i++) {
    if (i === close || (text[i] === "," && enclosing[i] === open)) {
      const raw = text.slice(start, i);
      const leading = raw.length - raw.trimStart().length;
      if (raw.trim() !== "") {
        entries.push({ text: raw.trim(), start: start + leading });
      }
      start = i + 1;
    }
  }
  return entries;
};

/** The type name a type reads as, or null when it can't be read. */
const typeName = (type: string | undefined) => {
  const trimmed = type?.trim();
  return trimmed !== undefined && phpTypeName.regex.test(trimmed)
    ? trimmed
    : null;
};

/** The input type: the type of the only parameter, or null with none, several or untyped. */
const readInput = (parameters: readonly ListEntry[]) => {
  const [only] = parameters;
  if (parameters.length !== 1 || only === undefined) {
    return null;
  }
  const match = phpParameter.regex.exec(only.text);
  if (match === null || match[2] !== undefined) {
    return null;
  }
  return typeName(match[1]);
};

/** The output: the declared return type, or null when there is none or it returns nothing. */
const readOutput = (text: string, afterParameters: number) => {
  const returnAt = stickyCopy(phpReturnType);
  returnAt.lastIndex = afterParameters;
  const type = typeName(returnAt.exec(text)?.[1]);
  return type === null || noOutput.has(type.toLowerCase()) ? null : type;
};

/** The names a `use` statement's list imports, each in full, in order. */
const importedNames = (list: string) => {
  const names: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of `${list},`) {
    if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth--;
    }
    if (character === "," && depth === 0) {
      const match = phpImportedName.regex.exec(current.trim());
      const [, prefix, group] = match ?? [];
      if (prefix !== undefined && group === undefined) {
        names.push(prefix);
      } else if (prefix !== undefined && group !== undefined) {
        for (const member of group.split(",")) {
          const inner = phpImportedName.regex.exec(member.trim())?.[1];
          if (inner !== undefined) {
            names.push(`${prefix}\\${inner}`);
          }
        }
      }
      current = "";
    } else {
      current += character;
    }
  }
  return names;
};

/**
 * The package-level namespace an imported name comes from: the namespace it sits in, up to its
 * first two parts, as Composer packages name them (vendor, then package). `Aws\S3\S3Client`
 * comes from `Aws\S3`, and `Stripe\StripeClient` from `Stripe`.
 */
const packageNamespace = (name: string) => {
  const parts = name.split("\\");
  const namespace = parts.slice(0, -1);
  return (namespace.length === 0 ? parts : namespace).slice(0, 2).join("\\");
};

/**
 * Each third-party namespace imported, with the line of its first import. PHP's own names, the
 * Temporal SDK's and the file's own root namespace are left out.
 */
const readDependencies = (
  found: (pattern: Pattern) => RegExpExecArray[],
  lineOf: LineOf,
  isTopLevel: (offset: number) => boolean,
  isStandardLibrary: (name: string) => boolean,
): NamedLineRef[] => {
  const ownRoot = found(phpNamespaceDeclaration)[0]?.[1]?.toLowerCase();
  const imported = firstByName(
    found(phpUseStatement)
      .filter((match) => isTopLevel(match.index))
      .flatMap((match) =>
        importedNames(match[1] ?? "").flatMap((name) => {
          const root = name.split("\\")[0]?.toLowerCase();
          return isStandardLibrary(name) ||
            root === temporalSdkNamespace ||
            root === ownRoot
            ? []
            : [{ name: packageNamespace(name), line: lineOf(match.index) }];
        }),
      ),
  );
  // A namespace inside another one imported, such as Stripe\Exception beside Stripe, is the
  // same package.
  const lowered = imported.map(({ name }) => name.toLowerCase());
  return imported.filter((_, index) =>
    lowered.every((other) => !(lowered[index] ?? "").startsWith(`${other}\\`)),
  );
};

type ActivitySignature = Pick<
  ActivityFacts,
  "activity" | "input" | "output" | "runsAs"
>;

/** How identification recognises PHP: a use of the SDK's namespace and the activity attribute. */
export const phpRecognition: SdkRecognition = {
  sdkMarkers: [phpSdkUse],
  // Java's activity annotations match this too, so it never marks the SDK on its own.
  activityMarkers: [phpActivityAttribute],
  shapeMarkers: [],
};

/**
 * Detects PHP activities. The file-wide facts (non-retryable errors, configuration read,
 * dependencies and heartbeats) are read from the whole file and reported on every activity.
 * PHP activities always run synchronously: the worker process runs one at a time.
 */
export const phpDetector: Detector = {
  detect(source, isStandardLibrary) {
    const { text } = source;
    const lineOf = lineFinder(text);
    const ignored = ignoredSpans(text);
    const inCode = (match: RegExpExecArray) => !isInside(ignored, match.index);
    const found = (pattern: Pattern, flags = "") =>
      allMatches(pattern, text, flags).filter(inCode);
    const enclosing = enclosingBrackets(text, ignored);

    // A use statement imports names only outside any brace, or directly inside a braced
    // namespace block. Anywhere else, such as in a class body, it imports a trait.
    const isTopLevel = (offset: number) => {
      const brace = enclosing[offset] ?? -1;
      return brace === -1 || phpNamespaceBlock.regex.test(text.slice(0, brace));
    };

    const nonRetryableErrors: LineRef[] = found(phpNonRetryableThrow).flatMap(
      (thrown) => {
        const open = thrown.index + thrown[0].length - 1;
        const args = listEntries(text, enclosing, open);
        const named = args.find(({ text: arg }) =>
          phpNonRetryableArgument.regex.test(arg),
        );
        const third = args[2];
        const positional =
          third !== undefined && phpTrueArgument.regex.test(third.text)
            ? third
            : undefined;
        const marking = named ?? positional;
        return marking === undefined ? [] : [{ line: lineOf(marking.start) }];
      },
    );
    const configurationRead = firstByName(
      found(phpEnvironmentRead).map((match) => ({
        name: match[1] ?? match[2] ?? match[3] ?? match[4] ?? "",
        line: lineOf(match.index),
      })),
    );
    const dependencies = readDependencies(
      found,
      lineOf,
      isTopLevel,
      isStandardLibrary,
    );
    const heartbeats: LineRef[] = found(phpHeartbeatCall).map((match) => ({
      line: lineOf(match.index + match[0].toLowerCase().indexOf("heartbeat")),
    }));

    const beforeTypeAt = stickyCopy(phpBeforeType);
    const typeAt = stickyCopy(phpActivityType);
    const methods = found(phpMethod, "d");

    const signatures = found(phpActivityInterfaceAttribute).flatMap(
      (attribute): ActivitySignature[] => {
        beforeTypeAt.lastIndex = attribute.index + attribute[0].length;
        beforeTypeAt.exec(text);
        typeAt.lastIndex = beforeTypeAt.lastIndex;
        const type = typeAt.exec(text);
        if (type === null) {
          return [];
        }
        const body = typeAt.lastIndex - 1;
        return methods
          .filter(
            (method) =>
              enclosing[method.index] === body &&
              !notActivityModifier.test(method[1] ?? "") &&
              !(method[2] ?? "").startsWith("__"),
          )
          .map((method) => {
            const open = method.index + method[0].length - 1;
            const close = closingBracket(text, enclosing, open);
            return {
              activity: {
                name: method[2] ?? "",
                line: lineOf(method.indices?.[2]?.[0] ?? method.index),
              },
              input: readInput(listEntries(text, enclosing, open)),
              output: readOutput(text, close + 1),
              runsAs: "sync",
            };
          });
      },
    );
    return signatures.map((signature) => ({
      ...signature,
      nonRetryableErrors,
      configurationRead,
      dependencies,
      heartbeats,
    }));
  },
};
