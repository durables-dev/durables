import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../app-env";
import { onError } from "../http/error-handlers";
import { problemContentType, ProblemError } from "../http/problem";
import {
  CheckRefusal,
  codeTooLarge,
  multipleActivities,
  noActivity,
  notTemporalActivity,
  refusalTypes,
  sdkChoiceNeeded,
  unacceptedSdk,
} from "./refusals";
import { MAX_CODE_BYTES } from "./size-limit";

const answerFor = async (refusal: CheckRefusal) => {
  const app = new Hono<AppEnv>()
    .get("/", () => {
      throw refusal;
    })
    .onError(onError);
  const response = await app.request("/");
  return {
    status: response.status,
    contentType: response.headers.get("Content-Type"),
    body: await response.json<Record<string, unknown>>(),
  };
};

describe("refusals", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("are ProblemErrors, so app.onError answers them", () => {
    expect(noActivity("Python")).toBeInstanceOf(ProblemError);
    expect(noActivity("Python").name).toBe("CheckRefusal");
  });

  it.each([
    [
      "no activity",
      noActivity(".NET"),
      refusalTypes.noActivity,
      422,
      { sdk: ".NET" },
    ],
    [
      "not a Temporal activity",
      notTemporalActivity(),
      refusalTypes.notTemporalActivity,
      422,
      {},
    ],
    [
      "SDK not identified",
      sdkChoiceNeeded("not-identified"),
      refusalTypes.sdkChoiceNeeded,
      422,
      { reason: "not-identified" },
    ],
    [
      "ambiguous SDK",
      sdkChoiceNeeded("ambiguous"),
      refusalTypes.sdkChoiceNeeded,
      422,
      { reason: "ambiguous" },
    ],
    [
      "unaccepted SDK",
      unacceptedSdk("Go"),
      refusalTypes.unacceptedSdk,
      422,
      { sdk: "Go" },
    ],
    [
      "multiple activities",
      multipleActivities(3),
      refusalTypes.multipleActivities,
      422,
      { count: 3 },
    ],
    [
      "too large",
      codeTooLarge(),
      refusalTypes.codeTooLarge,
      413,
      { limitBytes: MAX_CODE_BYTES },
    ],
  ] as const)(
    "answers a %s refusal with its Problem Details type, status and extensions",
    async (_, refusal, type, status, extensions) => {
      const answer = await answerFor(refusal);
      expect(answer.status).toBe(status);
      expect(answer.contentType).toBe(problemContentType);
      expect(answer.body).toEqual({
        type,
        status,
        title: expect.any(String) as string,
        detail: expect.any(String) as string,
        ...extensions,
      });
    },
  );

  it("answers without logging", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    await answerFor(multipleActivities(2));
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("uses a type that is a stable URI, never the title or detail", () => {
    for (const refusal of [
      noActivity("TypeScript"),
      notTemporalActivity(),
      sdkChoiceNeeded("ambiguous"),
      unacceptedSdk("Go"),
      multipleActivities(2),
      codeTooLarge(),
    ]) {
      const { type, title, detail } = refusal.problem;
      expect(type).toMatch(/^https:\/\/durables\.dev\/problems\/[a-z-]+$/);
      expect(type).not.toBe(title);
      expect(type).not.toBe(detail);
    }
  });
});
