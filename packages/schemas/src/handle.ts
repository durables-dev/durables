import { z } from "zod";

// Words no publisher can hold. Activity pages live at /:handle/:name, so web's top-level
// routes are here (web/CONVENTIONS.md): adding a top-level route means adding it here. So is
// "assets", the path the site build is served from. The rest are names that would suggest an
// official account. Every entry fits the format rule.
export const reservedHandles = new Set([
  "admin",
  "durables",
  "temporal",
  "api",
  "assets",
  "search",
  "contribute",
  "profile",
  "sign-in",
  "terms",
  "privacy",
  "security",
]);

/**
 * The handle format: 3 to 39 characters, lowercase letters, numbers and single hyphens,
 * starting and ending with a letter or number. A hyphen must be followed by a letter or
 * number, which rules out a trailing hyphen and two hyphens in a row.
 */
export const handlePattern = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,38}$/;

/** The wording for an empty handle, which is told apart from a bad format. */
export const handleEmptyMessage = "Choose a handle.";

export const handleFormatMessage =
  "Use 3 to 39 lowercase letters, numbers and single hyphens.";

/** The wording for a handle that fits the rule and is free. */
export const handleAvailableMessage = (handle: string) =>
  `${handle} is available.`;

/** The one wording for a handle that cannot be had: used, retired or reserved. */
export const handleTakenMessage = (handle: string) => `${handle} is taken.`;

/** The wording for a handle the format rule refuses: empty, or a bad format. */
export const handleInvalidMessage = (handle: string) =>
  handle === "" ? handleEmptyMessage : handleFormatMessage;

/** True when the handle is one of the reserved words. */
export const isReservedHandle = (handle: string) => reservedHandles.has(handle);

/**
 * The format rule alone. Uppercase is refused, never lowercased. An empty handle gets the
 * empty wording only. Use it where a reserved word must be told apart from a bad format,
 * such as a 409 for taken and a 400 for format.
 */
export const handleFormatSchema = z
  .string()
  .min(1, { error: handleEmptyMessage, abort: true })
  .regex(handlePattern, { error: handleFormatMessage });

/** The format rule plus the reserved words, which report as taken. */
export const handleSchema = handleFormatSchema.refine(
  (handle) => !isReservedHandle(handle),
  { error: (issue) => handleTakenMessage(String(issue.input)) },
);

/** What the shared rule alone says about a handle, before anything is looked up. */
export type HandleRuleResult = "invalid" | "taken" | "valid";

/**
 * Applies the shared rule. "invalid" is a format failure, "taken" a reserved word, and
 * "valid" a handle that still has to be checked against the handles in use and retired.
 */
export const checkHandleRule = (handle: string): HandleRuleResult => {
  if (!handleFormatSchema.safeParse(handle).success) {
    return "invalid";
  }
  return isReservedHandle(handle) ? "taken" : "valid";
};
