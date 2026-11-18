import {
  handleTakenMessage,
  versionNotHigherMessage,
  versionTakenMessage,
} from "@durables/schemas";
import {
  type FieldError,
  type ProblemDetails,
  ProblemError,
} from "../http/problem";

// Why a publish was refused, beyond the checks pipeline's own refusals (src/checks/refusals.ts).
// Each is a ProblemError with its own Problem Details type, so web branches on `type`, never on
// the title or detail. None of them quotes the code.

const problemType = (slug: string) => `https://durables.dev/problems/${slug}`;

/** The stable Problem Details type of each publish refusal. */
export const publishProblemTypes = {
  handleNotChosen: problemType("handle-not-chosen"),
  addressTaken: problemType("address-taken"),
  handleTaken: problemType("handle-taken"),
  invalidListing: problemType("invalid-listing"),
  publishLimited: problemType("publish-limited"),
  versionTaken: problemType("version-taken"),
  versionNotHigher: problemType("version-not-higher"),
  baseNotFound: problemType("base-not-found"),
} as const;

/** The message under the name field when this publisher already has a listing at the address. */
export const addressTakenMessage =
  "You already have a listing at this address.";

/** The handle is taken by another account. `handle` names it. */
export interface HandleTakenProblem extends ProblemDetails {
  type: typeof publishProblemTypes.handleTaken;
  status: 409;
  /** The handle that was taken. */
  handle: string;
}

/** The session has no handle chosen, so there is nowhere to publish. */
export const handleNotChosen = () =>
  new ProblemError({
    type: publishProblemTypes.handleNotChosen,
    status: 403,
    title: "No handle chosen",
    detail: "Choose a handle before publishing.",
  });

/** The address is already published. Nothing was written. */
export const addressTaken = () =>
  new ProblemError({
    type: publishProblemTypes.addressTaken,
    status: 409,
    title: "Address taken",
    detail: addressTakenMessage,
    errors: [{ field: "name", message: addressTakenMessage }],
  });

/** The handle was taken by another account since it was chosen. Nothing was written. */
export const handleTaken = (handle: string) => {
  const message = handleTakenMessage(handle);
  const extensions: Pick<HandleTakenProblem, "handle"> = { handle };
  return new ProblemError({
    type: publishProblemTypes.handleTaken,
    status: 409,
    title: "Handle taken",
    detail: message,
    errors: [{ field: "handle", message }],
    extensions,
  });
};

/** A detail is invalid or a confirmation is not given. One error per failing field. */
export const invalidListing = (errors: FieldError[]) =>
  new ProblemError({
    type: publishProblemTypes.invalidListing,
    status: 422,
    title: "Listing not accepted",
    detail: "Some of the listing's details or confirmations are not accepted.",
    errors,
  });

/** The publisher has used up their publishes for now. */
export const publishLimited = () =>
  new ProblemError({
    type: publishProblemTypes.publishLimited,
    status: 429,
    detail: "Too many publishes in a short time. Wait a minute and try again.",
  });

/** The listing already has this version. Versions are published once. Nothing was written. */
export const versionTaken = (version: string) => {
  const message = versionTakenMessage(version);
  return new ProblemError({
    type: publishProblemTypes.versionTaken,
    status: 409,
    title: "Version taken",
    detail: message,
    errors: [{ field: "version", message }],
  });
};

/** The version is not higher than the listing's latest. Nothing was written. */
export const versionNotHigher = (latest: string) => {
  const message = versionNotHigherMessage(latest);
  return new ProblemError({
    type: publishProblemTypes.versionNotHigher,
    status: 422,
    title: "Version not higher",
    detail: message,
    errors: [{ field: "version", message }],
  });
};

/** The version a new one is based on is not one of the listing's. Nothing was written. */
export const baseNotFound = (listing: string, basedOn: string) => {
  const message = `${listing} has no version ${basedOn}. Start from one of its versions.`;
  return new ProblemError({
    type: publishProblemTypes.baseNotFound,
    status: 422,
    title: "Base version not found",
    detail: message,
    errors: [{ field: "basedOn", message }],
  });
};
