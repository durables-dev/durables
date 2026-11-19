import type { FactValues } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { heartbeatTimeoutLines } from "./heartbeat-timeout";
import { installLabel, runLabel } from "./labels";
import { render } from "./render";
import { environmentLines } from "./shell";
import install from "./templates/ruby/install.txt";
import run from "./templates/ruby/run.txt";
import starterUnknownInput from "./templates/ruby/starter-unknown-input.txt";
import starter from "./templates/ruby/starter.txt";
import worker from "./templates/ruby/worker.txt";
import workflowUnknownInput from "./templates/ruby/workflow-unknown-input.txt";
import workflow from "./templates/ruby/workflow.txt";

/**
 * A Ruby double-quoted string literal holding the text. JSON's escapes are valid Ruby escapes,
 * and a `#` that would start an interpolation is escaped.
 */
const rubyString = (text: string) =>
  JSON.stringify(text).replace(/#(?=[{$@])/g, "\\#");

/** A Ruby string: the text, a hyphen, then a fresh UUID. */
const rubyIdWithUuid = (text: string) =>
  `${rubyString(`${text}-`).slice(0, -1)}#{SecureRandom.uuid}"`;

/**
 * The workflow class's name: the activity class's own name, without its namespace or an
 * `Activity` ending, then `Workflow`. `Billing::ChargeCardActivity` becomes
 * `ChargeCardWorkflow`.
 */
export const rubyWorkflowClass = (activity: string) => {
  const own = activity.split("::").pop() ?? activity;
  const withoutActivity = own.replace(/Activity$/, "");
  return `${withoutActivity === "" ? own : withoutActivity}Workflow`;
};

/**
 * The Implement snippets for a Ruby activity, in the order the Activity page shows them. The
 * worker sets up no activity executor: Ruby's default runs the activity.
 */
export const rubySnippets = (
  facts: FactValues,
  address: Address,
): Snippet[] => {
  const activity = facts.activity.name;
  const workflowClass = rubyWorkflowClass(activity);
  // Detection reports require names, which can differ from the gem's name
  // (active_support is activesupport), and adding one by its require name can fetch someone
  // else's gem.
  const requires = facts.dependencies.map(({ name }) => name);
  const values = {
    heartbeatTimeout: heartbeatTimeoutLines(
      facts,
      "#",
      "heartbeat_timeout: 10,",
    ),
    activity,
    workflowClass,
    inputType: facts.input ?? "",
    taskQueue: rubyString(address.name),
    workflowId: rubyIdWithUuid(address.name),
    gemsNote:
      requires.length === 0
        ? ""
        : `# Also add the gems that provide: ${requires.join(", ")}`,
    environment: environmentLines(facts.configurationRead),
  };
  const known = facts.input !== null;
  return [
    { label: installLabel, code: render(install, values) },
    {
      label: "workflow.rb",
      code: render(known ? workflow : workflowUnknownInput, values),
    },
    { label: "worker.rb", code: render(worker, values) },
    {
      label: "starter.rb",
      code: render(known ? starter : starterUnknownInput, values),
    },
    { label: runLabel, code: render(run, values) },
  ];
};
