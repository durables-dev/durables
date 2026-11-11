import {
  checkHandleRule,
  handleAvailableMessage,
  handleFormatMessage,
  handleInvalidMessage,
  handleTakenMessage,
} from "@durables/schemas";
import { fieldMessage, problemFrom } from "@/lib/problem";
import type { HandleAvailabilityResponse } from "./handle-availability";

/** What the availability check answered. */
export type HandleAvailability = HandleAvailabilityResponse["availability"];

/** Where the availability lookup for the handle in the field has got to. */
export type HandleLookup =
  | { state: "pending" }
  | { state: "failed" }
  | { state: "answered"; availability: HandleAvailability };

/** What the availability line says about the handle in the field. */
export interface HandleStatus {
  kind: "available" | "taken" | "invalid" | "checking" | "failed" | "unsaved";
  message: string;
}

export const handleCheckingMessage = "Checking…";

/** The line shown when the availability check itself fails. */
export const handleCheckFailedMessage = (handle: string) =>
  `We couldn't check ${handle}. Try again.`;

/** True when the shared rule allows the handle, so it has to be looked up. */
export function needsLookup(handle: string): boolean {
  return checkHandleRule(handle) === "valid";
}

/**
 * The availability line for a handle. The shared rule answers first: empty, a bad format and
 * a reserved word need no lookup. Otherwise the lookup decides.
 */
export function handleStatus(
  handle: string,
  lookup: HandleLookup,
): HandleStatus {
  const rule = checkHandleRule(handle);
  if (rule === "invalid") {
    return { kind: "invalid", message: handleInvalidMessage(handle) };
  }
  if (rule === "taken") {
    return { kind: "taken", message: handleTakenMessage(handle) };
  }
  switch (lookup.state) {
    case "pending":
      return { kind: "checking", message: handleCheckingMessage };
    case "failed":
      return { kind: "failed", message: handleCheckFailedMessage(handle) };
    case "answered":
      return answered(handle, lookup.availability);
  }
}

function answered(
  handle: string,
  availability: HandleAvailability,
): HandleStatus {
  switch (availability) {
    case "available":
      return { kind: "available", message: handleAvailableMessage(handle) };
    case "taken":
      return { kind: "taken", message: handleTakenMessage(handle) };
    case "invalid":
      return { kind: "invalid", message: handleFormatMessage };
  }
}

/** The line shown when publish found the chosen handle taken by another account. */
export const handleJustTakenMessage =
  "That handle was just taken. Choose another.";

/** The line shown when a save fails for a reason other than the handle itself. */
export const handleUnsavedMessage = "Your handle wasn't saved. Try again.";

/**
 * The availability line after a save of the handle failed. A 409 means it is taken and a 400
 * that it breaks the format rule. Anything else leaves the handle as it was, to save again.
 */
export function handleSaveRefusal(
  handle: string,
  error: unknown,
): HandleStatus {
  const problem = problemFrom(error);
  switch (problem?.status) {
    case 409:
      return { kind: "taken", message: handleTakenMessage(handle) };
    case 400:
      return {
        kind: "invalid",
        message: fieldMessage(problem, "handle") ?? handleFormatMessage,
      };
    default:
      return { kind: "unsaved", message: handleUnsavedMessage };
  }
}

/** Continue saves the handle only when it is available, or when a save of it can be retried. */
export function canSaveHandle(status: HandleStatus): boolean {
  return status.kind === "available" || status.kind === "unsaved";
}
