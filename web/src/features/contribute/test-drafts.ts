import type { CheckedFacts, CheckResult } from "./check-result";
import type { Draft } from "./draft";

// Drafts for tests, as the Code step leaves them. Imported by tests only.

/** A pasted Python activity. */
export const pastedCode = [
  "from temporalio import activity",
  "",
  "@activity.defn",
  "async def post_slack_message(message: SlackMessage) -> MessageRef:",
  "\treturn await send(message)",
].join("\n");

/** The facts the check endpoint answers for `pastedCode`. */
export const acceptedFacts: CheckedFacts = {
  sdk: "Python",
  activity: { name: "post_slack_message", line: 4 },
  input: "SlackMessage",
  output: "MessageRef",
  runsAs: "async",
  nonRetryableErrors: [],
  configurationRead: [],
  dependencies: [],
  heartbeats: [],
};

/** What the check reports for `pastedCode`. */
export const acceptedCheck: CheckResult = {
  outcome: "accepted",
  facts: acceptedFacts,
};

/** A check that refused the file, as for a file with no activity in it. */
export const refusedCheck: CheckResult = {
  outcome: "refused",
  problem: {
    type: "https://durables.dev/problems/no-activity",
    title: "No activity found",
    status: 422,
  },
};

/** Profile & Handle finished and the pasted file accepted, so Code is finished too. */
export const acceptedDraft: Draft = {
  finished: ["profile"],
  code: pastedCode,
  check: acceptedCheck,
};
