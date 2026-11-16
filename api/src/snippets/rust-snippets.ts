import type { FactValues } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { installLabel, runLabel } from "./labels";
import { render } from "./render";
import { environmentLines } from "./shell";
import install from "./templates/rust/install.txt";
import run from "./templates/rust/run.txt";
import starterUnknownInput from "./templates/rust/starter-unknown-input.txt";
import starter from "./templates/rust/starter.txt";
import worker from "./templates/rust/worker.txt";
import workflowUnknownInput from "./templates/rust/workflow-unknown-input.txt";
import workflow from "./templates/rust/workflow.txt";
import { importedNames, sortedNames, unique } from "./type-names";

/**
 * A name in a Rust type that the file must bring into scope: not part of a path, not a
 * lifetime. `serde_json::Value` needs no `use`, because a crate's path is always in scope.
 */
const rustTypeIdentifier = /(?<![\w:'])[A-Za-z_]\w*(?![\w:])/g;

/** Rust's own types, the prelude's and the keywords a type can hold, never imported. */
const rustBuiltIns: ReadonlySet<string> = new Set([
  "Box",
  "Option",
  "Result",
  "Self",
  "String",
  "Vec",
  "bool",
  "char",
  "dyn",
  "f32",
  "f64",
  "i128",
  "i16",
  "i32",
  "i64",
  "i8",
  "impl",
  "isize",
  "mut",
  "str",
  "u128",
  "u16",
  "u32",
  "u64",
  "u8",
  "usize",
]);

/** Crates the install fragment already adds, which the install note leaves out. */
const fragmentCrates: ReadonlySet<string> = new Set([
  "futures",
  "serde",
  "tokio",
]);

/**
 * The Cargo.toml name of each integration crate whose `use` name differs from it. Cargo names
 * these crates with hyphens, and their code is used with underscores.
 */
const cargoNames: ReadonlyMap<string, string> = new Map([
  ["aws_sdk_s3", "aws-sdk-s3"],
  ["slack_morphism", "slack-morphism"],
  ["tokio_postgres", "tokio-postgres"],
]);

/** The escape for one character in a Rust string literal, or the character itself. */
const rustCharacter = (character: string) => {
  switch (character) {
    case "\\":
      return "\\\\";
    case '"':
      return '\\"';
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "\t":
      return "\\t";
    default: {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f
        ? `\\u{${code.toString(16)}}`
        : character;
    }
  }
};

/** A Rust string literal holding the text. */
const rustString = (text: string) =>
  `"${[...text].map(rustCharacter).join("")}"`;

/** A Rust format string: the text, a hyphen, then one argument. Braces in the text are escaped. */
const rustIdFormat = (text: string) =>
  rustString(`${text.replaceAll("{", "{{").replaceAll("}", "}}")}-{}`);

/** A `use` declaration bringing the names into scope from the module, or nothing for none. */
const useDeclaration = (module: string, names: readonly string[]) => {
  const sorted = sortedNames(unique(names));
  if (sorted.length === 0) {
    return "";
  }
  const [only] = sorted;
  return sorted.length === 1 && only !== undefined
    ? `use ${module}::${only};`
    : `use ${module}::{${sorted.join(", ")}};`;
};

/**
 * The workflow struct's name: the activity's name in PascalCase, then `Workflow`.
 * `charge_card` becomes `ChargeCardWorkflow`, and a raw identifier such as `r#match` becomes
 * `MatchWorkflow`. A name that would not start with a letter starts with `Activity` instead.
 */
export const rustWorkflowStruct = (activity: string) => {
  const pascal = activity
    .replace(/^r#/, "")
    .split("_")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Za-z]/.test(pascal)
    ? `${pascal}Workflow`
    : `Activity${pascal}Workflow`;
};

/**
 * The Implement snippets for a Rust activity, in the order the Activity page shows them. The
 * detected facts don't name the type whose `#[activities]` impl declares the activity, so the
 * files use `Activities` and say to change it.
 */
export const rustSnippets = (
  facts: FactValues,
  address: Address,
): Snippet[] => {
  const activity = facts.activity.name;
  const workflowStruct = rustWorkflowStruct(activity);
  const hasOutput = facts.output !== null;
  const inputNames = importedNames(
    facts.input,
    rustTypeIdentifier,
    rustBuiltIns,
  );
  const outputNames = importedNames(
    facts.output,
    rustTypeIdentifier,
    rustBuiltIns,
  );
  const known = facts.input !== null;
  // Detection reports the crate a use path names, which can differ from the crate Cargo.toml
  // installs: async-stripe's code is used as stripe. Adding one by that name can fetch
  // someone else's crate, so only a known integration crate is named as Cargo names it.
  const crates = facts.dependencies
    .map(({ name }) => name)
    .filter((name) => !fragmentCrates.has(name))
    .map((name) => cargoNames.get(name) ?? name);
  const values = {
    activity,
    workflowClass: workflowStruct,
    inputType: facts.input ?? "",
    outputType: facts.output ?? "()",
    resultBinding: hasOutput ? "let result = " : "",
    resultValue: hasOutput ? "result" : "()",
    printResult: hasOutput ? 'println!("{result:?}");' : "",
    activitiesUse: useDeclaration("crate::activities", [
      "Activities",
      ...(known ? inputNames : []),
      ...outputNames,
    ]),
    inputUse: useDeclaration("crate::activities", inputNames),
    workflowsUse: useDeclaration("crate::workflows", [workflowStruct, "Input"]),
    taskQueue: rustString(address.name),
    workflowIdFormat: rustIdFormat(address.name),
    packagesNote:
      crates.length === 0
        ? ""
        : `# Also add the crates that provide: ${crates.join(", ")}`,
    environment: environmentLines(facts.configurationRead),
  };
  return [
    { label: installLabel, code: render(install, values) },
    {
      label: "workflows.rs",
      code: render(known ? workflow : workflowUnknownInput, values),
    },
    { label: "main.rs", code: render(worker, values) },
    {
      label: "starter.rs",
      code: render(known ? starter : starterUnknownInput, values),
    },
    { label: runLabel, code: render(run, values) },
  ];
};
