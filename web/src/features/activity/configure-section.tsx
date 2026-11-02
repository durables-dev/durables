import type { Sdk } from "@/lib/sdk-language";
import styles from "./configure-section.module.css";
import type { VersionResponse } from "./listing-queries";

/** How the activity runs, as detection found it. Null when detection couldn't tell. */
export type RunsAs = VersionResponse["facts"]["runsAs"];

export interface ConfigureSectionProps {
  /** The environment variable names detection found in the code. Empty when it found none. */
  environmentVariables: readonly string[];
  /** The input type's name. Null when it couldn't be read from the code. */
  input: string | null;
  /** The output type's name. Null when it couldn't be read from the code. */
  output: string | null;
  runsAs: RunsAs;
  sdk: Sdk;
}

// The Configure section: the environment variable names, the input and output type names,
// and the worker requirements. Durables shows no activity options here (API map D14).
export function ConfigureSection({
  environmentVariables,
  input,
  output,
  runsAs,
  sdk,
}: ConfigureSectionProps) {
  return (
    <>
      <h2 className={styles["title"]}>Configure</h2>
      <EnvironmentVariables names={environmentVariables} />
      <div className={styles["group"]}>
        <h3 className={styles["heading"]}>Input and output</h3>
        <ul className={styles["types"]} aria-label="Input and output types">
          <TypeCard kind="Input" name={input} />
          <TypeCard kind="Output" name={output} />
        </ul>
      </div>
      {runsAs === null ? null : (
        <WorkerRequirements runsAs={runsAs} sdk={sdk} />
      )}
    </>
  );
}

interface EnvironmentVariablesProps {
  names: readonly string[];
}

function EnvironmentVariables({ names }: EnvironmentVariablesProps) {
  return (
    <div className={styles["group"]}>
      <h3 className={styles["heading"]}>Environment variables</h3>
      {names.length === 0 ? (
        <p className={styles["none"]}>
          No environment variables found in the code.
        </p>
      ) : (
        <ul className={styles["variables"]} aria-label="Environment variables">
          {names.map((name) => (
            <li key={name} className={styles["variable"]}>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TypeCardProps {
  kind: "Input" | "Output";
  name: string | null;
}

function TypeCard({ kind, name }: TypeCardProps) {
  return (
    <li className={styles["card"]}>
      <span className={styles["role"]}>{kind}</span>
      {name === null ? (
        <span className={styles["unread"]}>
          The {kind.toLowerCase()} type couldn&apos;t be read from the code.
        </span>
      ) : (
        <span className={styles["type"]}>{name}</span>
      )}
    </li>
  );
}

interface WorkerRequirementsProps {
  runsAs: Exclude<RunsAs, null>;
  sdk: Sdk;
}

function WorkerRequirements({ runsAs, sdk }: WorkerRequirementsProps) {
  return (
    <div className={styles["group"]}>
      <h3 className={styles["heading"]}>Worker requirements</h3>
      <p className={styles["prose"]}>{workerRequirementsText(runsAs, sdk)}</p>
    </div>
  );
}

// TypeScript activities are always detected as async, so only Python and .NET reach the
// sync branch. The .NET worker file sets up no thread pool, so its sentence names none.
function workerRequirementsText(runsAs: Exclude<RunsAs, null>, sdk: Sdk) {
  if (runsAs === "async") {
    return "This is an async activity. Your worker needs no special setup to run it.";
  }
  if (sdk === ".NET") {
    return "This is a synchronous activity. The .NET SDK runs it for you, so your worker needs no special setup.";
  }
  return "This is a synchronous activity. Your worker needs a thread pool to run it, which the worker file in Implement already sets up.";
}
