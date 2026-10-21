import { describe, expect, test } from "vitest";
import {
  draftFinished,
  draftReducer,
  draftStorageKey,
  emptyDraft,
  enterDraft,
  isAccepted,
  readDraft,
  writeDraft,
  type Draft,
} from "./draft";
import {
  acceptedCheck,
  acceptedDraft,
  pastedCode,
  refusedCheck,
} from "./test-drafts";

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

describe("the pasted code and its check", () => {
  test("editing the code keeps it exactly as pasted", () => {
    expect(
      draftReducer(emptyDraft, { type: "codeEdited", code: pastedCode }),
    ).toEqual({ finished: [], code: pastedCode });
  });

  test("a finished check is kept with the code it checked", () => {
    const draft = draftReducer(
      { finished: ["profile"], code: pastedCode },
      { type: "checkFinished", code: pastedCode, result: acceptedCheck },
    );

    expect(draft).toEqual(acceptedDraft);
  });

  test("a refusal is kept as the check result too", () => {
    const draft = draftReducer(
      { finished: ["profile"], code: pastedCode },
      { type: "checkFinished", code: pastedCode, result: refusedCheck },
    );

    expect(draft.check).toEqual(refusedCheck);
  });

  test("editing the code drops the check", () => {
    const draft = draftReducer(acceptedDraft, {
      type: "codeEdited",
      code: `${pastedCode}\n`,
    });

    expect(draft.code).toBe(`${pastedCode}\n`);
    expect(draft.check).toBeUndefined();
    expect(isAccepted(draft)).toBe(false);
  });

  test("an edit that leaves the code as it was keeps the check", () => {
    expect(
      draftReducer(acceptedDraft, { type: "codeEdited", code: pastedCode }),
    ).toBe(acceptedDraft);
  });

  test("a check of code that has since changed is dropped", () => {
    const draft: Draft = { finished: ["profile"], code: "newer" };

    expect(
      draftReducer(draft, {
        type: "checkFinished",
        code: pastedCode,
        result: acceptedCheck,
      }),
    ).toBe(draft);
  });

  test("publishing clears the code and the check", () => {
    const draft = draftReducer(acceptedDraft, { type: "published" });

    expect(draft.code).toBeUndefined();
    expect(draft.check).toBeUndefined();
  });

  test("publishing empties the kept draft", () => {
    const storage = memoryStorage();
    writeDraft(storage, acceptedDraft);

    writeDraft(storage, draftReducer(acceptedDraft, { type: "published" }));

    const stored = storage.getItem(draftStorageKey) ?? "";
    expect(stored).not.toContain("post_slack_message");
    expect(stored).not.toContain("check");
    expect(readDraft(storage)).toEqual(emptyDraft);
  });
});

describe("Code is finished", () => {
  test("once the pasted file is accepted", () => {
    expect(draftFinished(acceptedDraft)).toEqual(["profile", "code"]);
  });

  test("not before anything is pasted", () => {
    expect(draftFinished({ finished: ["profile"] })).toEqual(["profile"]);
  });

  test("not while the code is unchecked", () => {
    expect(draftFinished({ finished: ["profile"], code: pastedCode })).toEqual([
      "profile",
    ]);
  });

  test("not when the file was refused", () => {
    expect(
      draftFinished({
        finished: ["profile"],
        code: pastedCode,
        check: refusedCheck,
      }),
    ).toEqual(["profile"]);
  });

  test("not on the word of the finished list alone", () => {
    expect(draftFinished({ finished: ["profile", "code"] })).toEqual([
      "profile",
    ]);
  });
});

describe("reading the kept code and check back", () => {
  test("a reload keeps the code and the check", () => {
    const storage = memoryStorage();
    writeDraft(storage, acceptedDraft);

    expect(readDraft(storage)).toEqual(acceptedDraft);
  });

  test("a reload keeps a refusal", () => {
    const storage = memoryStorage();
    const refused = { ...acceptedDraft, check: refusedCheck };
    writeDraft(storage, refused);

    expect(readDraft(storage)).toEqual(refused);
  });

  test("a refusal keeps the members it adds, such as the SDK", () => {
    const storage = memoryStorage();
    const refused: Draft = {
      ...acceptedDraft,
      check: {
        outcome: "refused",
        problem: {
          type: "https://durables.dev/problems/unaccepted-sdk",
          title: "SDK not accepted",
          status: 422,
          sdk: "Java",
        },
      },
    };
    writeDraft(storage, refused);

    expect(readDraft(storage)).toEqual(refused);
  });

  test("code kept with no check comes back with no check", () => {
    const storage = memoryStorage();
    writeDraft(storage, { finished: ["profile"], code: pastedCode });

    expect(readDraft(storage)).toEqual({
      finished: ["profile"],
      code: pastedCode,
    });
  });

  test("an unreadable check is dropped and the code kept", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({
        finished: ["profile"],
        code: pastedCode,
        check: { outcome: "accepted", facts: { sdk: "Java" } },
      }),
    });

    const draft = readDraft(storage);
    expect(draft.code).toBe(pastedCode);
    expect(draft.check).toBeUndefined();
  });

  test("a check kept with no code is dropped", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({
        finished: ["profile"],
        check: acceptedCheck,
      }),
    });

    expect(readDraft(storage).check).toBeUndefined();
  });

  test("code that is not text starts the draft empty", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({ finished: ["profile"], code: 42 }),
    });

    expect(readDraft(storage)).toEqual(emptyDraft);
  });
});

describe("storage the browser refuses", () => {
  test("no storage at all starts the draft empty", () => {
    expect(readDraft(undefined)).toEqual(emptyDraft);
  });

  test("storage that throws on read starts the draft empty", () => {
    const refusing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };

    expect(readDraft(refusing)).toEqual(emptyDraft);
  });

  test("storage that throws on write is passed over without an error", () => {
    const refusing = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };

    expect(() => {
      writeDraft(refusing, acceptedDraft);
    }).not.toThrow();
    expect(() => {
      writeDraft(undefined, acceptedDraft);
    }).not.toThrow();
  });
});
