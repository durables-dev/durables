import { describe, expect, test } from "vitest";
import {
  draftReducer,
  draftStorageKey,
  emptyDraft,
  enterDraft,
  readDraft,
  writeDraft,
} from "./draft";

// A stand-in for sessionStorage. Unit tests run in Node, which has none.
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

describe("draftReducer", () => {
  test("records a finished step", () => {
    expect(
      draftReducer(emptyDraft, { type: "stepFinished", step: "profile" }),
    ).toEqual({
      finished: ["profile"],
    });
  });

  test("records a step once, however often it is finished", () => {
    const draft = { finished: ["profile" as const] };
    expect(draftReducer(draft, { type: "stepFinished", step: "profile" })).toBe(
      draft,
    );
  });
});

describe("readDraft", () => {
  test("starts empty when nothing is kept", () => {
    expect(readDraft(memoryStorage())).toEqual(emptyDraft);
  });

  test("reads back the draft that was written, as after a reload", () => {
    const storage = memoryStorage();
    writeDraft(storage, { finished: ["profile", "code"] });

    expect(readDraft(storage)).toEqual({ finished: ["profile", "code"] });
  });

  test("starts empty when the kept draft is not JSON", () => {
    expect(
      readDraft(memoryStorage({ [draftStorageKey]: "{not json" })),
    ).toEqual(emptyDraft);
  });

  test("starts empty when the kept draft has the wrong shape", () => {
    expect(
      readDraft(
        memoryStorage({
          [draftStorageKey]: JSON.stringify({ finished: ["readme"] }),
        }),
      ),
    ).toEqual(emptyDraft);
    expect(readDraft(memoryStorage({ [draftStorageKey]: "null" }))).toEqual(
      emptyDraft,
    );
  });
});

describe("the page the flow was opened from", () => {
  test("is kept with the draft, as after a round trip to a sign-in provider", () => {
    const storage = memoryStorage();
    writeDraft(storage, { finished: [], origin: "/terms" });

    expect(readDraft(storage)).toEqual({ finished: [], origin: "/terms" });
  });

  test("an unreadable origin is dropped and the rest of the draft kept", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({
        finished: ["profile"],
        origin: "https://example.com/",
      }),
    });

    expect(readDraft(storage)).toEqual({ finished: ["profile"] });
  });

  test("opening the flow from a page records that page", () => {
    expect(enterDraft({ finished: ["profile"] }, "/privacy")).toEqual({
      finished: ["profile"],
      origin: "/privacy",
    });
  });

  test("opening the flow from a newer page replaces the kept one", () => {
    expect(enterDraft({ finished: [], origin: "/terms" }, "/privacy")).toEqual({
      finished: [],
      origin: "/privacy",
    });
  });

  test("opening the flow without naming a page keeps the kept one", () => {
    const draft = { finished: [], origin: "/terms" };
    expect(enterDraft(draft, undefined)).toBe(draft);
  });
});
