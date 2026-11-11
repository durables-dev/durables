import { problemFrom } from "@/lib/problem";
import { refusalTypes } from "./check-line";

// Why a publish did not go through, and what the Review step does about it. Refusals are told
// apart by their Problem Details type and status, never by their title or detail
// (web/CONVENTIONS.md, Data). The types are the API's (api: activities/publish-problems.ts).

/** The Problem Details type of each publish refusal the flow handles on its own. */
export const publishRefusalTypes = {
  addressTaken: "https://durables.dev/problems/address-taken",
  handleTaken: "https://durables.dev/problems/handle-taken",
  invalidListing: "https://durables.dev/problems/invalid-listing",
  publishLimited: "https://durables.dev/problems/publish-limited",
} as const;

/** What the Review step does after a publish was refused. */
export type PublishRefusal =
  /** The publisher already has a listing at this address: back to Details. */
  | { kind: "addressTaken" }
  /** Another account took the handle: back to the handle step. `handle` names it, if given. */
  | { kind: "handleTaken"; handle: string | undefined }
  /** Anything else: a message above Publish, with the boxes left as they are. */
  | { kind: "failed"; message: string };

export const publishTooLargeMessage =
  "This file is too large to publish. The limit is 100 KB.";

export const publishCodeRefusedMessage =
  "The code didn't pass its check when publishing. Go back to Code and paste it again.";

export const publishDetailsRefusedMessage =
  "Some of the details or confirmations weren't accepted. Check them and try again.";

export const publishLimitedMessage =
  "Too many publishes in a short time. Wait a minute and try again.";

/** Said for a refusal the flow has no answer for, a server error, or a network failure. */
export const publishFailedMessage = "Publishing didn't go through. Try again.";

const checkRefusalTypes: readonly string[] = Object.values(refusalTypes);

/** What a failed publish means for the flow. */
export function publishRefusal(error: unknown): PublishRefusal {
  const problem = problemFrom(error);
  if (problem === undefined) {
    return { kind: "failed", message: publishFailedMessage };
  }
  if (
    problem.status === 409 &&
    problem.type === publishRefusalTypes.addressTaken
  ) {
    return { kind: "addressTaken" };
  }
  if (
    problem.status === 409 &&
    problem.type === publishRefusalTypes.handleTaken
  ) {
    const handle: unknown = problem["handle"];
    return {
      kind: "handleTaken",
      handle: typeof handle === "string" ? handle : undefined,
    };
  }
  switch (problem.status) {
    case 413:
      return { kind: "failed", message: publishTooLargeMessage };
    case 422:
      return {
        kind: "failed",
        message: checkRefusalTypes.includes(problem.type)
          ? publishCodeRefusedMessage
          : publishDetailsRefusedMessage,
      };
    case 429:
      return { kind: "failed", message: publishLimitedMessage };
    default:
      return { kind: "failed", message: publishFailedMessage };
  }
}
