import type { Detector } from "./detector";
import type { ActivityFacts, LineRef, NamedLineRef } from "./facts";
import type { SdkRecognition } from "./identify";
import type { Pattern } from "./pattern";
import {
  allMatches,
  enclosingBrackets,
  isInside,
  type LineOf,
  lineFinder,
  type Span,
} from "./scan";
import type { Source } from "./source";

// Java detection (ADR 0008). Every pattern below is part of the published rubric. A match only
// counts when it starts in code: comments, string literals, text blocks and character literals
// are ignored, so commented-out code and examples in strings are never detected.
//
// Java declares an activity on an interface. Every abstract method of an interface annotated
// @ActivityInterface is an activity. A paste that holds only the implementing class carries no
// Temporal annotation; its activities are the class's public instance methods.

/** A Java import from the Temporal SDK, such as `import io.temporal.activity.ActivityInterface;`. */
export const javaSdkImport: Pattern = {
  name: "java-sdk-import",
  description:
    "A Java import from the Temporal SDK's io.temporal package, such as import io.temporal.activity.ActivityInterface.",
  regex: /^[ \t]*import[ \t]+(?:static[ \t]+)?io\.temporal\./m,
};

/** A Java activity annotation: `@ActivityInterface` or `@ActivityMethod`. */
export const javaActivityAnnotation: Pattern = {
  name: "java-activity-annotation",
  description:
    "The @ActivityInterface or @ActivityMethod annotation on a Java interface or method.",
  regex: /@Activity(?:Interface|Method)\b/,
};

/**
 * A public class that implements an interface, such as
 * `public class GreetingActivitiesImpl implements GreetingActivities {`. It is the shape of an
 * activity implementation, which carries no Temporal annotation.
 */
export const javaImplementationClass: Pattern = {
  name: "java-implementation-class",
  description:
    "A public class that implements an interface, such as public class GreetingActivitiesImpl implements GreetingActivities. An activity's implementing class carries no Temporal annotation, so a file with only this shape is inferred to be Java.",
  regex:
    /^[ \t]*public[ \t]+(?:final[ \t]+)?class[ \t]+[A-Za-z_$][\w$]*(?:[ \t]*<[^{\n]*>)?(?:\s+extends\s+[\w$.<>,? \t]+?)?\s+implements\s+[A-Za-z_$]/m,
};

/** The `@ActivityInterface` annotation, which marks the interface below it as declaring activities. */
export const javaActivityInterfaceAnnotation: Pattern = {
  name: "java-activity-interface-annotation",
  description:
    "The @ActivityInterface annotation, written as is or as @io.temporal.activity.ActivityInterface. The interface it annotates declares the activities.",
  regex: /(?<![\w$.])@(?:io\.temporal\.activity\.)?ActivityInterface\b/,
};

/**
 * A type declaration's keyword and name, such as `interface SmsActivities`. Group 1 is the
 * keyword, group 2 the name.
 */
export const javaTypeDeclaration: Pattern = {
  name: "java-type-declaration",
  description:
    "The keyword and name of a type declaration: interface, class, record or enum, such as interface SmsActivities. The first one after @ActivityInterface is the interface it annotates.",
  regex: /(?<![\w$.@])(interface|class|record|enum)\s+([A-Za-z_$][\w$]*)/,
};

/**
 * A class that implements an interface, up to the opening brace of its body. Group 1 is the
 * class's name.
 */
export const javaImplementingClass: Pattern = {
  name: "java-implementing-class",
  description:
    "A class that implements an interface, such as class Impl implements SmsActivities {, read up to the brace that opens its body. Its public instance methods are its activities when the file has no @ActivityInterface.",
  regex:
    /(?<![\w$.])class\s+([A-Za-z_$][\w$]*)\s*(?:<[^{]*?>\s*)?(?:extends\s+[^{]+?\s+)?implements\s+[^{;]+\{/,
};

/**
 * A Java type as written: a name or dotted name, with generic arguments nested up to three
 * deep, and array brackets. Shared by the patterns that read types.
 */
const javaType = String.raw`[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*(?:\s*<(?:[^<>;{}()]|<(?:[^<>;{}()]|<[^<>;{}()]*>)*>)*>)?(?:\s*\[\s*\])*`;

/** An annotation, with or without arguments. */
const javaAnnotation = String.raw`@[A-Za-z_$][\w$.]*(?:\s*\((?:[^()]|\([^()]*\))*\))?`;

/**
 * A method declaration where a member starts, after a brace or a semicolon, up to the `;`
 * that ends an abstract method or the `{` that opens a body. Groups: 1 the annotations and modifiers, 2 the return type, 3 the name, 4 the
 * parameters, 5 the `;` or `{`.
 */
export const javaMethodDeclaration: Pattern = {
  name: "java-method-declaration",
  description:
    "A method declaration where a member starts, after a brace or a semicolon: its annotations and modifiers, its return type, its name, its parameters and any throws clause, ending at the ; of an abstract method or the { of a method body.",
  regex: new RegExp(
    String.raw`(?=[@A-Za-z_$<])(?<=(?:^|[{};])\s*)((?:(?:${javaAnnotation}|public|protected|private|static|final|abstract|default|synchronized|native|strictfp)\s+)*)(?:<(?:[^<>]|<[^<>]*>)*>\s*)?(?!(?:new|return|throw|else|case|yield|assert|record|class|interface|enum)\b)(${javaType})\s+([A-Za-z_$][\w$]*)\s*\(((?:[^()]|\([^()]*\))*)\)\s*(?:throws\s+[\w$.,\s<>]+?)?\s*([;{])`,
  ),
};

/**
 * One method parameter, such as `SmsRequest request`, optionally with annotations and `final`.
 * Group 1 is its type. A variable-arity parameter does not match.
 */
export const javaParameter: Pattern = {
  name: "java-parameter",
  description:
    "One method parameter with its type, such as SmsRequest request, optionally with annotations and final. A variable-arity parameter, such as String... names, is shown as unknown.",
  regex: new RegExp(
    String.raw`^(?:(?:final|${javaAnnotation})\s+)*(${javaType})\s+[A-Za-z_$][\w$]*(?:\s*\[\s*\])*$`,
  ),
};

/** A type that reads as a type name. Anything else is shown as unknown. */
export const javaTypeName: Pattern = {
  name: "java-type-name",
  description:
    "A type that can be shown as a type name, such as SmsRequest, com.acme.SmsRequest, List<String> or byte[]. Anything else is shown as unknown.",
  regex: new RegExp(`^${javaType}$`),
};

/**
 * A call to the SDK's non-retryable application failure factory, such as
 * `ApplicationFailure.newNonRetryableFailure(`.
 */
export const javaNonRetryableFailure: Pattern = {
  name: "java-non-retryable-failure",
  description:
    "A call to ApplicationFailure.newNonRetryableFailure or ApplicationFailure.newNonRetryableFailureWithCause, which creates a failure Temporal never retries.",
  regex:
    /(?<![\w$])ApplicationFailure\s*\.\s*newNonRetryableFailure(?:WithCause)?\s*\(/,
};

/** An application failure built as non-retryable, such as `.setNonRetryable(true)`. */
export const javaNonRetryableBuilder: Pattern = {
  name: "java-non-retryable-builder",
  description:
    "An application failure built with setNonRetryable(true), such as ApplicationFailure.newBuilder().setNonRetryable(true). The line reported is the line of setNonRetryable.",
  regex: /\.\s*setNonRetryable\s*\(\s*true\s*\)/,
};

/** An environment variable read by name. Group 1 is the variable's name. */
export const javaEnvironmentRead: Pattern = {
  name: "java-environment-read",
  description:
    'An environment variable read by name: System.getenv("NAME"), with or without the java.lang. prefix.',
  regex:
    /(?<![\w$.])(?:java\s*\.\s*lang\s*\.\s*)?System\s*\.\s*getenv\s*\(\s*"([A-Za-z_]\w*)"\s*\)/,
};

/**
 * An import declaration. Group 1 is the name imported, group 2 the `.*` of an on-demand import.
 */
export const javaImportDeclaration: Pattern = {
  name: "java-import-declaration",
  description:
    "An import declaration, such as import com.stripe.Stripe;, import com.stripe.model.*; or import static org.junit.Assert.assertEquals;. The dependency is the package imported from: the parts of the name before the first one that starts with a capital letter.",
  regex:
    /^[ \t]*import\s+(?:static\s+)?([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)(\s*\.\s*\*)?\s*;/m,
};

/** The file's package declaration. Group 1 is the package. */
export const javaPackageDeclaration: Pattern = {
  name: "java-package-declaration",
  description:
    "The file's package declaration, such as package com.acme.notifications;. Imports from this package and the packages under it are the publisher's own code, not dependencies.",
  regex:
    /^[ \t]*package\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/m,
};

/**
 * A heartbeat call, such as `Activity.getExecutionContext().heartbeat(progress)`, from the
 * member access dot. The line reported is the line of `heartbeat`.
 */
export const javaHeartbeatCall: Pattern = {
  name: "java-heartbeat-call",
  description:
    "A call to heartbeat on the activity's execution context, such as Activity.getExecutionContext().heartbeat(progress) or context.heartbeat(null).",
  regex: /\.\s*heartbeat\s*\(/,
};

/**
 * An AWS SDK service package, version 2 or 1, such as `software.amazon.awssdk.services.s3`.
 * Group 1 is the package up to and including the service.
 */
export const javaAwsServicePackage: Pattern = {
  name: "java-aws-service-package",
  description:
    "A package of one AWS service's client, such as software.amazon.awssdk.services.s3 or com.amazonaws.services.s3.model. Its integration key is the package up to the service's name.",
  regex:
    /^((?:software\.amazon\.awssdk|com\.amazonaws)\.services\.[a-z0-9_$]+)(?:\.|$)/,
};

/**
 * The organisation part of a package: its first two parts, the reverse domain name, such as
 * `com.stripe`. Group 1 is that part.
 */
export const javaOrganisationPackage: Pattern = {
  name: "java-organisation-package",
  description:
    "The first two parts of a package, the reverse domain name of the organisation that publishes it, such as com.stripe from com.stripe.model or org.postgresql from org.postgresql.ds. It is the integration key of every package but an AWS service's.",
  regex: /^([a-z_$][\w$]*\.[a-z_$][\w$]*)(?:\.|$)/,
};

/** Every Java pattern, as published in the rubric. */
export const javaPatterns: readonly Pattern[] = [
  javaSdkImport,
  javaActivityAnnotation,
  javaImplementationClass,
  javaActivityInterfaceAnnotation,
  javaTypeDeclaration,
  javaImplementingClass,
  javaMethodDeclaration,
  javaParameter,
  javaTypeName,
  javaNonRetryableFailure,
  javaNonRetryableBuilder,
  javaEnvironmentRead,
  javaImportDeclaration,
  javaPackageDeclaration,
  javaHeartbeatCall,
  javaAwsServicePackage,
  javaOrganisationPackage,
];

/**
 * The package prefixes of the Java platform: the `java.` and `javax.` packages, the JDK's own
 * `jdk.`, `sun.` and `com.sun.` packages, and the W3C, SAX and GSS packages the JDK ships.
 */
const standardLibraryPrefixes: readonly string[] = [
  "java",
  "javax",
  "jdk",
  "sun",
  "com.sun",
  "org.w3c.dom",
  "org.xml.sax",
  "org.ietf.jgss",
];

/** Whether a package is the prefix or sits under it. */
const isUnder = (pkg: string, prefix: string) =>
  pkg === prefix || pkg.startsWith(`${prefix}.`);

/**
 * Whether a package is part of the Java platform rather than a third-party library. A package
 * prefix rule: everything under `java.` and `javax.` counts, including `javax.` packages that
 * ship separately today.
 */
export const isJavaStandardLibrary = (pkg: string) =>
  standardLibraryPrefixes.some((prefix) => isUnder(pkg, prefix));

/** The Temporal Java SDK's own package, which Dependencies leaves out. */
const temporalSdkPackage = "io.temporal";

/**
 * The integration key of a Java dependency, which is a package. An AWS service's package keeps
 * the service, so S3 is told apart from other services. Any other package is keyed by its
 * organisation, so `com.stripe.model` and `com.stripe` are both `com.stripe`.
 */
export const normaliseJavaDependency = (pkg: string) => {
  const lower = pkg.toLowerCase();
  const aws = javaAwsServicePackage.regex.exec(lower)?.[1];
  if (aws !== undefined) {
    return aws;
  }
  return javaOrganisationPackage.regex.exec(lower)?.[1] ?? lower;
};

/** How identification recognises Java. */
export const javaRecognition: SdkRecognition = {
  sdkMarkers: [javaSdkImport],
  activityMarkers: [javaActivityAnnotation],
  shapeMarkers: [javaImplementationClass],
};

/** A name with the spaces around its dots removed: `com . stripe` is `com.stripe`. */
const dotted = (name: string) => name.replace(/\s+/g, "");

/**
 * The package an import's name is in: the parts before the first one that starts with a capital
 * letter, which is a class. An on-demand import of a package is that package. A name with no
 * capitalised part drops its last part, the class.
 */
const importedPackage = (name: string, onDemand: boolean) => {
  const parts = dotted(name).split(".");
  const firstClass = parts.findIndex((part) => /^[A-Z]/.test(part));
  if (firstClass !== -1) {
    return parts.slice(0, firstClass).join(".");
  }
  return (onDemand ? parts : parts.slice(0, -1)).join(".");
};

/**
 * How many characters a string-like literal starting at `start` runs for, if one does: a text
 * block, a string or a character literal. Null when none starts here.
 */
const literalEnd = (text: string, start: number): number | null => {
  const character = text[start];
  if (character === '"' && text.startsWith('"""', start)) {
    let i = start + 3;
    while (i < text.length && !text.startsWith('"""', i)) {
      i += text[i] === "\\" ? 2 : 1;
    }
    return Math.min(text.length, i + 3);
  }
  if (character === '"' || character === "'") {
    let i = start + 1;
    while (i < text.length && text[i] !== character && text[i] !== "\n") {
      i += text[i] === "\\" ? 2 : 1;
    }
    return Math.min(text.length, text[i] === character ? i + 1 : i);
  }
  return null;
};

/** The spans of the text that are comments, strings, text blocks or character literals. */
const ignoredSpans = (text: string): Span[] => {
  const spans: Span[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("//", i)) {
      const newline = text.indexOf("\n", i);
      const end = newline === -1 ? text.length : newline;
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? text.length : close + 2;
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    const end = literalEnd(text, i);
    if (end !== null) {
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    i++;
  }
  return spans;
};

/**
 * The text with every ignored span blanked to spaces, keeping its line breaks, so offsets and
 * line numbers are the same as the text's and structure is read from code alone.
 */
const codeOnly = (text: string, ignored: readonly Span[]) => {
  let masked = "";
  let at = 0;
  for (const { start, end } of ignored) {
    masked += text.slice(at, start);
    masked += text.slice(start, end).replace(/[^\n]/g, " ");
    at = end;
  }
  return masked + text.slice(at);
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

/** The type name a type reads as, with spaces collapsed, or null when it can't be read. */
const typeName = (type: string) => {
  const trimmed = type.trim().replace(/\s+/g, " ");
  return javaTypeName.regex.test(trimmed) ? trimmed : null;
};

/** The input type: the type of the only parameter, or null with none or several. */
const readInput = (parameterList: string) => {
  const parameters = splitParameters(parameterList);
  const [only] = parameters;
  if (parameters.length !== 1 || only === undefined) {
    return null;
  }
  const type = javaParameter.regex.exec(only)?.[1];
  return type === undefined ? null : typeName(type);
};

/** Methods every class inherits from Object, which are never activities. */
const objectMethods: ReadonlySet<string> = new Set([
  "toString",
  "equals",
  "hashCode",
]);

/** A method declared directly in a type's body. */
interface Member {
  /** The annotations and modifiers, split on whitespace. */
  readonly modifiers: readonly string[];
  readonly name: string;
  readonly returnType: string;
  readonly parameters: string;
  readonly abstract: boolean;
  /** The offset of the method's name. */
  readonly nameAt: number;
}

/**
 * Every method declared directly in a type body, by the offset of the brace that opens the
 * body. Read once over the code, so each type's methods are not searched for again.
 */
const membersByBody = (code: string) => {
  const enclosing = enclosingBrackets(code, []);

  const members = new Map<number, Member[]>();
  for (const match of allMatches(javaMethodDeclaration, code, "d")) {
    const body = enclosing[match.index] ?? -1;
    if (body === -1) {
      continue;
    }
    const [, modifiers = "", returnType = "", name = "", parameters = ""] =
      match;
    const member: Member = {
      modifiers: modifiers.split(/\s+/),
      name,
      returnType,
      parameters,
      abstract: match[5] === ";",
      nameAt: match.indices?.[3]?.[0] ?? match.index,
    };
    members.set(body, [...(members.get(body) ?? []), member]);
  }
  return (open: number): readonly Member[] => members.get(open) ?? [];
};

/**
 * The interface that declares an activity: its name, and the names of the types declared
 * directly in its body, such as a nested input record.
 */
interface Owner {
  readonly name: string;
  readonly nestedTypes: ReadonlySet<string>;
}

/**
 * The type with each name the owner declares written as `Owner.Name`. A type nested in the
 * activity's interface can only be named that way from outside the file, as the generated
 * workflow and starter do. A name already qualified, after a dot, is left alone.
 */
const qualified = (type: string | null, owner: Owner | undefined) =>
  type === null || owner === undefined || owner.nestedTypes.size === 0
    ? type
    : type.replace(/(?<![\w$.])[A-Za-z_$][\w$]*/g, (name) =>
        owner.nestedTypes.has(name) ? `${owner.name}.${name}` : name,
      );

/** The activity, its input and output, and how it runs, read from its method. */
const signatureOf = (
  { member, owner }: ActivityMember,
  lineOf: LineOf,
): Pick<ActivityFacts, "activity" | "input" | "output" | "runsAs"> => {
  const returnType = typeName(member.returnType);
  return {
    activity: { name: member.name, line: lineOf(member.nameAt) },
    input: qualified(readInput(member.parameters), owner),
    output: returnType === "void" ? null : qualified(returnType, owner),
    // The Java SDK calls an activity method on a worker thread and waits for it to return.
    runsAs: "sync",
  };
};

/** An activity method, and the @ActivityInterface that declares it when there is one. */
interface ActivityMember {
  readonly member: Member;
  readonly owner: Owner | undefined;
}

/** Whether a member's modifiers hold the modifier. */
const hasModifier = ({ modifiers }: Member, modifier: string) =>
  modifiers.includes(modifier);

/**
 * The activity methods of the code. With an @ActivityInterface, they are the abstract methods
 * of each annotated interface. Without one, they are the public instance methods of each class
 * that implements an interface, leaving out the methods every class has from Object.
 */
const activityMembers = (code: string): ActivityMember[] => {
  const membersOf = membersByBody(code);
  const interfaces = new Map<number, string>();
  for (const annotation of allMatches(javaActivityInterfaceAnnotation, code)) {
    const after = annotation.index + annotation[0].length;
    const declaration = javaTypeDeclaration.regex.exec(code.slice(after));
    if (declaration?.[1] !== "interface" || declaration[2] === undefined) {
      continue;
    }
    const open = code.indexOf("{", after + declaration.index);
    if (open !== -1) {
      interfaces.set(open, declaration[2]);
    }
  }
  if (interfaces.size > 0) {
    const enclosing = enclosingBrackets(code, []);
    const declarations = allMatches(javaTypeDeclaration, code);
    return [...interfaces].flatMap(([open, name]) => {
      const owner: Owner = {
        name,
        nestedTypes: new Set(
          declarations
            .filter((declaration) => enclosing[declaration.index] === open)
            .flatMap((declaration) => declaration[2] ?? []),
        ),
      };
      return membersOf(open)
        .filter((member) => member.abstract && !hasModifier(member, "static"))
        .map((member) => ({ member, owner }));
    });
  }
  return allMatches(javaImplementingClass, code).flatMap((declaration) =>
    membersOf(declaration.index + declaration[0].length - 1)
      .filter(
        (member) =>
          !member.abstract &&
          hasModifier(member, "public") &&
          !hasModifier(member, "static") &&
          !objectMethods.has(member.name),
      )
      .map((member) => ({ member, owner: undefined })),
  );
};

/** Each package imported, with the line of its first import, keeping the first of each. */
const importedPackages = (code: string, lineOf: LineOf): NamedLineRef[] => {
  const seen = new Map<string, number>();
  for (const match of allMatches(javaImportDeclaration, code)) {
    const name = match[1];
    if (name === undefined) {
      continue;
    }
    const pkg = importedPackage(name, match[2] !== undefined);
    if (pkg !== "" && !seen.has(pkg)) {
      seen.set(pkg, lineOf(match.index + match[0].indexOf("import")));
    }
  }
  return [...seen].map(([name, line]) => ({ name, line }));
};

/**
 * Each third-party package imported, with the line of its first import. The Temporal SDK, the
 * standard library and the file's own package are left out. A package under another imported
 * package is the same library, so it is folded into that one, at the earlier line.
 */
const readDependencies = (
  code: string,
  lineOf: LineOf,
  isStandardLibrary: (name: string) => boolean,
): NamedLineRef[] => {
  const ownPackage = javaPackageDeclaration.regex.exec(code)?.[1];
  const own = ownPackage === undefined ? null : dotted(ownPackage);
  const thirdParty = importedPackages(code, lineOf).filter(
    ({ name }) =>
      !isUnder(name, temporalSdkPackage) &&
      !isStandardLibrary(name) &&
      (own === null || !isUnder(name, own)),
  );
  const libraries = thirdParty.filter(
    ({ name }) =>
      !thirdParty.some(
        (other) => other.name !== name && isUnder(name, other.name),
      ),
  );
  return libraries
    .map((library) => ({
      name: library.name,
      line: Math.min(
        ...thirdParty
          .filter(({ name }) => isUnder(name, library.name))
          .map(({ line }) => line),
      ),
    }))
    .sort((a, b) => a.line - b.line);
};

/**
 * Detects Java activities. The file-wide facts (non-retryable errors, configuration read,
 * dependencies and heartbeats) are read from the whole file and reported on every activity.
 */
export const javaDetector: Detector = {
  detect(source: Source, isStandardLibrary) {
    const { text } = source;
    const lineOf = lineFinder(text);
    const ignored = ignoredSpans(text);
    const code = codeOnly(text, ignored);

    const nonRetryableErrors: LineRef[] = [
      ...allMatches(javaNonRetryableFailure, code).map((match) => match.index),
      ...allMatches(javaNonRetryableBuilder, code).map(
        (match) => match.index + match[0].indexOf("setNonRetryable"),
      ),
    ]
      .sort((a, b) => a - b)
      .map((offset) => ({ line: lineOf(offset) }));
    const seenVariables = new Set<string>();
    const configurationRead: NamedLineRef[] = allMatches(
      javaEnvironmentRead,
      text,
    ).flatMap((match) => {
      const name = match[1];
      if (
        name === undefined ||
        isInside(ignored, match.index) ||
        seenVariables.has(name)
      ) {
        return [];
      }
      seenVariables.add(name);
      return [{ name, line: lineOf(match.index) }];
    });
    const dependencies = readDependencies(code, lineOf, isStandardLibrary);
    const heartbeats: LineRef[] = allMatches(javaHeartbeatCall, code).map(
      (match) => ({
        line: lineOf(match.index + match[0].indexOf("heartbeat")),
      }),
    );

    return activityMembers(code).map((member) => ({
      ...signatureOf(member, lineOf),
      nonRetryableErrors,
      configurationRead,
      dependencies,
      heartbeats,
    }));
  },
};
