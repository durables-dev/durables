import { fieldMessage, problemFrom } from "@/lib/problem";
import { publishFailedMessage, publishRefusal } from "./publish-refusal";

// Why a new version was not published. The Review step stays where it is and shows the
// message above Publish, with nothing in the draft lost. Refusals are told apart by their
// Problem Details type, never by their text (web/CONVENTIONS.md, Data). The types are the API's
// (api: activities/publish-problems.ts).

/** The Problem Details type of each refusal only a new version can meet. */
export const newVersionRefusalTypes = {
  versionTaken: "https://durables.dev/problems/version-taken",
  versionNotHigher: "https://durables.dev/problems/version-not-higher",
  baseNotFound: "https://durables.dev/problems/base-not-found",
} as const;

const fieldOf: Record<string, string> = {
  [newVersionRefusalTypes.versionTaken]: "version",
  [newVersionRefusalTypes.versionNotHigher]: "version",
  [newVersionRefusalTypes.baseNotFound]: "basedOn",
};

/**
 * The message for a refused new version. A number or base the API refused is said in the
 * API's words for that field. Anything else is said as a first publish says it.
 */
export function newVersionRefusal(error: unknown): string {
  const problem = problemFrom(error);
  const field = problem === undefined ? undefined : fieldOf[problem.type];
  if (problem !== undefined && field !== undefined) {
    return fieldMessage(problem, field) ?? publishFailedMessage;
  }
  const refusal = publishRefusal(error);
  return refusal.kind === "failed" ? refusal.message : publishFailedMessage;
}
