import styles from "./configure-section.module.css";

/** How the activity runs, as detection found it. Null when detection couldn't tell. */
export type RunsAs = "sync" | "async" | null;

export interface ConfigureSectionProps {
  /** The environment variable names detection found in the code. Empty when it found none. */
  environmentVariables: readonly string[];
  /** The input type's name. Null when it couldn't be read from the code. */
  input: string | null;
  /** The output type's name. Null when it couldn't be read from the code. */
  output: string | null;
  runsAs: RunsAs;
}

// The Configure section: the environment variable names, the input and output type names,
// and the worker requirements. Durables shows no activity options here (API map D14).
export function ConfigureSection({
  environmentVariables,
  input,
  output,
  runsAs,
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
      {runsAs === null ? null : <WorkerRequirements runsAs={runsAs} />}
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
  runsAs: "sync" | "async";
}

function WorkerRequirements({ runsAs }: WorkerRequirementsProps) {
  return (
    <div className={styles["group"]}>
      <h3 className={styles["heading"]}>Worker requirements</h3>
      <p className={styles["prose"]}>
        {runsAs === "sync"
          ? "This is a synchronous activity. Your worker needs a thread pool to run it, which the worker file in Implement already sets up."
          : "This is an async activity. Your worker needs no special setup to run it."}
      </p>
    </div>
  );
}
