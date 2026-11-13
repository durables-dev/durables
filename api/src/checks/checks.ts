import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { AppEnv } from "../app-env";
import type { Session } from "../auth/auth";
import { requirePublisher } from "../auth/require-publisher";
import { ProblemError } from "../http/problem";
import { publisherLimitKey } from "../http/rate-limits";
import { problemOnInvalid } from "../http/validation";
import { registeredSdks } from "../sdks/registry";
import type { Facts } from "./facts";
import { type CheckedSdk, checkCode } from "./pipeline";
import { codeTooLarge } from "./refusals";
import { MAX_CODE_BYTES } from "./size-limit";

// The detection check (ADR 0008): the contribute flow's preview of what detection finds in
// pasted code. It is informational. Nothing is stored, and publishing runs detection again
// and never accepts these results back. Nothing here logs, and no error carries the code.

/** The checks resource's environment: the app's, plus the signed-in publisher. */
interface ChecksEnv {
  Bindings: AppEnv["Bindings"];
  Variables: AppEnv["Variables"] & { publisher: Session };
}

/** The body of a check. Any other field, such as facts sent by the client, is dropped. */
const checkBody = z.object({ code: z.string() });

/** Answers 413 Problem Details, the same refusal as oversized code, when the body is too large. */
const checkBodyLimit = () =>
  bodyLimit({
    maxSize: MAX_CODE_BYTES,
    onError: () => {
      throw codeTooLarge();
    },
  });

/** Answers 429 when the publisher has used up their checks for now. */
const previewRateLimit = () =>
  createMiddleware<ChecksEnv>(async (c, next) => {
    const { success } = await c.var.previewLimit.limit({
      key: publisherLimitKey(c.var.publisher),
    });
    if (!success) {
      throw new ProblemError({
        status: 429,
        detail: "Too many checks in a short time. Wait a minute and try again.",
      });
    }
    await next();
  });

/**
 * The checks resource, mounted at /api/checks, checking code against the given SDKs.
 * Production mounts `checks`, which checks against the SDK registry.
 */
export const createChecks = (checkedSdks: readonly CheckedSdk[]) =>
  new Hono<ChecksEnv>().post(
    "/",
    requirePublisher(),
    checkBodyLimit(),
    previewRateLimit(),
    zValidator("json", checkBody, problemOnInvalid),
    (c) => {
      const { code } = c.req.valid("json");
      const facts = checkCode(code, checkedSdks);
      c.header("Cache-Control", "no-store");
      return c.json<Facts>(facts, 200);
    },
  );

/** The checks resource, checking against the SDK registry. */
export const checks = createChecks(registeredSdks);
