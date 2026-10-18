import {
  checkHandleRule,
  handleAvailableMessage,
  handleInvalidMessage,
  handleTakenMessage,
} from "@durables/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app-env";
import { problemOnInvalid } from "../http/validation";
import type { Storage } from "../storage/storage";

/** What the check says about a handle. Taken covers used, retired and reserved handles alike. */
export type HandleAvailability = "available" | "taken" | "invalid";

export interface HandleAvailabilityResponse {
  handle: string;
  availability: HandleAvailability;
  message: string;
}

/**
 * The query the check accepts. The handle is required but may be empty, which is invalid
 * and answered with the empty wording.
 */
const availabilityQuery = z.object({ handle: z.string() });

/** Applies the shared rule first, then looks the handle up only if the rule allows it. */
export const handleAvailability = async (
  storage: Storage,
  handle: string,
): Promise<HandleAvailability> => {
  const rule = checkHandleRule(handle);
  if (rule !== "valid") {
    return rule;
  }
  return (await storage.isHandleAvailable(handle)) ? "available" : "taken";
};

const messages: Record<HandleAvailability, (handle: string) => string> = {
  available: handleAvailableMessage,
  taken: handleTakenMessage,
  invalid: handleInvalidMessage,
};

/** The handles resource, mounted at /api/handles. */
export const handles = new Hono<AppEnv>().get(
  "/availability",
  zValidator("query", availabilityQuery, problemOnInvalid),
  async (c) => {
    const { handle } = c.req.valid("query");
    const availability = await handleAvailability(c.var.storage, handle);
    c.header("Cache-Control", "no-store");
    return c.json<HandleAvailabilityResponse>(
      { handle, availability, message: messages[availability](handle) },
      200,
    );
  },
);
