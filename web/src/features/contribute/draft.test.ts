import { describe, expect, test } from "vitest";
import type { CheckResult } from "./check-result";
import {
  draftConfirmations,
  draftDetails,
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
import type { ListingDetails } from "@durables/schemas";
import {
  acceptedCheck,
  acceptedDraft,
  acceptedFacts,
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

describe("the declared SDK", () => {
  const declaredCheck: CheckResult = {
    outcome: "accepted",
    facts: { ...acceptedFacts, sdk: "Go", provenance: { sdk: "declared" } },
  };

  test("declaring an SDK records it and drops the previous check", () => {
    const draft = draftReducer(acceptedDraft, {
      type: "sdkDeclared",
      sdk: "Go",
    });
    expect(draft.declaredSdk).toBe("Go");
    expect(draft.check).toBeUndefined();
    expect(draft.code).toBe(pastedCode);
  });

  test("a check sent with the declared SDK is kept", () => {
    const declared = draftReducer(acceptedDraft, {
      type: "sdkDeclared",
      sdk: "Go",
    });
    const checked = draftReducer(declared, {
      type: "checkFinished",
      code: pastedCode,
      declaredSdk: "Go",
      result: declaredCheck,
    });
    expect(checked.check).toEqual(declaredCheck);
  });

  test("changing the SDK again replaces the previous result, and a late answer for the old SDK is dropped", () => {
    let draft = draftReducer(acceptedDraft, { type: "sdkDeclared", sdk: "Go" });
    draft = draftReducer(draft, { type: "sdkDeclared", sdk: "Rust" });
    draft = draftReducer(draft, {
      type: "checkFinished",
      code: pastedCode,
      declaredSdk: "Go",
      result: declaredCheck,
    });
    expect(draft.declaredSdk).toBe("Rust");
    expect(draft.check).toBeUndefined();
  });

  test("a check sent without the declared SDK is dropped", () => {
    const declared = draftReducer(acceptedDraft, {
      type: "sdkDeclared",
      sdk: "Go",
    });
    const checked = draftReducer(declared, {
      type: "checkFinished",
      code: pastedCode,
      result: acceptedCheck,
    });
    expect(checked.check).toBeUndefined();
  });

  test("stays while the code is edited", () => {
    const declared = draftReducer(acceptedDraft, {
      type: "sdkDeclared",
      sdk: "Go",
    });
    const edited = draftReducer(declared, {
      type: "codeEdited",
      code: `${pastedCode}\n`,
    });
    expect(edited.declaredSdk).toBe("Go");
  });

  test.each(["", "  \n\t "])("goes when the editor is emptied (%j)", (code) => {
    const declared = draftReducer(acceptedDraft, {
      type: "sdkDeclared",
      sdk: "Go",
    });
    expect(
      draftReducer(declared, { type: "codeEdited", code }).declaredSdk,
    ).toBeUndefined();
  });

  test("is kept through a reload", () => {
    const storage = memoryStorage();
    const draft: Draft = {
      ...acceptedDraft,
      declaredSdk: "Go",
      check: declaredCheck,
    };
    writeDraft(storage, draft);
    expect(readDraft(storage)).toEqual(draft);
  });

  test("an unreadable declared SDK is dropped and the rest kept", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({ ...acceptedDraft, declaredSdk: 7 }),
    });
    expect(readDraft(storage)).toEqual(acceptedDraft);
  });

  test("publishing clears it", () => {
    const draft = draftReducer(
      { ...acceptedDraft, declaredSdk: "Go" },
      { type: "published" },
    );
    expect(draft.declaredSdk).toBeUndefined();
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

  test("a refusal keeps the members it adds, such as why the SDK must be chosen", () => {
    const storage = memoryStorage();
    const refused: Draft = {
      ...acceptedDraft,
      check: {
        outcome: "refused",
        problem: {
          type: "https://durables.dev/problems/sdk-choice-needed",
          title: "Choose an SDK",
          status: 422,
          reason: "ambiguous",
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

/** An accepted check of an activity with another name, as after the code is changed. */
function checkOfActivityNamed(name: string): CheckResult {
  return {
    outcome: "accepted",
    facts: { ...acceptedFacts, activity: { name, line: 4 } },
  };
}

/** The draft after the publisher pastes new code and its check finishes. */
function recheck(draft: Draft, code: string, activityName: string): Draft {
  const edited = draftReducer(draft, { type: "codeEdited", code });
  return draftReducer(edited, {
    type: "checkFinished",
    code,
    result: checkOfActivityNamed(activityName),
  });
}

/** The draft after the publisher edits each of the given fields, one edit per field. */
function editDetails(draft: Draft, edits: Partial<ListingDetails>): Draft {
  return (Object.entries(edits) as [keyof ListingDetails, string][]).reduce(
    (current, [field, value]) =>
      draftReducer(current, { type: "detailsEdited", field, value }),
    draft,
  );
}

const allConfirmed = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
};

/** The draft with the six confirmations checked one by one. */
function confirmAll(draft: Draft): Draft {
  return (Object.keys(allConfirmed) as (keyof typeof allConfirmed)[]).reduce(
    (current, confirmation) =>
      draftReducer(current, {
        type: "confirmationToggled",
        confirmation,
        checked: true,
      }),
    draft,
  );
}

describe("the default title and name", () => {
  test("come from a snake_case activity name", () => {
    expect(draftDetails(acceptedDraft)).toEqual({
      title: "Post slack message",
      name: "post-slack-message",
      description: "",
    });
  });

  test("come from a camelCase activity name", () => {
    const draft = {
      ...acceptedDraft,
      check: checkOfActivityNamed("chargeCard"),
    };

    expect(draftDetails(draft)).toEqual({
      title: "Charge card",
      name: "charge-card",
      description: "",
    });
  });

  test("come from a PascalCase activity name", () => {
    const draft = {
      ...acceptedDraft,
      check: checkOfActivityNamed("ChargeCard"),
    };

    expect(draftDetails(draft)).toEqual({
      title: "Charge card",
      name: "charge-card",
      description: "",
    });
  });

  test("handle digits and consecutive capitals", () => {
    const draft = {
      ...acceptedDraft,
      check: checkOfActivityNamed("uploadHTMLToS3"),
    };

    expect(draftDetails(draft)).toMatchObject({
      title: "Upload html to s3",
      name: "upload-html-to-s3",
    });
  });

  test("are empty with no accepted check", () => {
    const empty = { title: "", name: "", description: "" };
    expect(draftDetails(emptyDraft)).toEqual(empty);
    expect(draftDetails({ ...acceptedDraft, check: refusedCheck })).toEqual(
      empty,
    );
  });

  test("follow the activity name when the check changes and nothing was edited", () => {
    const draft = recheck(acceptedDraft, "newer code", "chargeCard");

    expect(draftDetails(draft)).toMatchObject({
      title: "Charge card",
      name: "charge-card",
    });
  });
});

describe("the publisher's edits to the details", () => {
  test("are kept in the draft", () => {
    const draft = editDetails(acceptedDraft, {
      title: "Slack poster",
      name: "slack-poster",
      description: "Posts a message to a Slack channel.",
    });

    expect(draftDetails(draft)).toEqual({
      title: "Slack poster",
      name: "slack-poster",
      description: "Posts a message to a Slack channel.",
    });
  });

  test("change only the fields edited", () => {
    const described = editDetails(acceptedDraft, {
      description: "Posts to Slack.",
    });

    const draft = draftReducer(described, {
      type: "detailsEdited",
      field: "title",
      value: "Slack poster",
    });

    expect(draftDetails(draft)).toEqual({
      title: "Slack poster",
      name: "post-slack-message",
      description: "Posts to Slack.",
    });
  });

  test("are not overwritten by the defaults when the check changes", () => {
    const edited = editDetails(acceptedDraft, { title: "Slack poster" });

    const draft = recheck(edited, "newer code", "chargeCard");

    expect(draftDetails(draft)).toEqual({
      title: "Slack poster",
      name: "charge-card",
      description: "",
    });
  });

  test("are kept when the draft reloads", () => {
    const storage = memoryStorage();
    const edited = editDetails(acceptedDraft, {
      name: "slack-poster",
      description: "Posts to Slack.",
    });
    writeDraft(storage, edited);

    expect(draftDetails(readDraft(storage))).toEqual({
      title: "Post slack message",
      name: "slack-poster",
      description: "Posts to Slack.",
    });
  });

  test("a field the publisher cleared stays empty", () => {
    const cleared = editDetails(acceptedDraft, { title: "", name: "" });

    expect(draftDetails(cleared)).toMatchObject({ title: "", name: "" });
    expect(
      draftDetails(recheck(cleared, "newer code", "chargeCard")),
    ).toMatchObject({ title: "", name: "" });

    const storage = memoryStorage();
    writeDraft(storage, cleared);
    expect(draftDetails(readDraft(storage))).toMatchObject({
      title: "",
      name: "",
    });
  });

  test("an unreadable kept field is dropped and reads as its default", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({
        ...acceptedDraft,
        details: { title: 42, description: "Posts to Slack." },
      }),
    });

    const draft = readDraft(storage);
    expect(draft.code).toBe(pastedCode);
    expect(draftDetails(draft)).toEqual({
      title: "Post slack message",
      name: "post-slack-message",
      description: "Posts to Slack.",
    });
  });
});

describe("the six confirmations", () => {
  test("start unchecked", () => {
    expect(draftConfirmations(acceptedDraft)).toEqual({
      rights: false,
      mitZero: false,
      noSecrets: false,
      notMalicious: false,
      noResponsibility: false,
      terms: false,
    });
  });

  test("checking one box checks that box only", () => {
    const draft = draftReducer(acceptedDraft, {
      type: "confirmationToggled",
      confirmation: "noSecrets",
      checked: true,
    });

    expect(draftConfirmations(draft)).toEqual({
      rights: false,
      mitZero: false,
      noSecrets: true,
      notMalicious: false,
      noResponsibility: false,
      terms: false,
    });
  });

  test("unchecking one box unchecks that box only", () => {
    const draft = draftReducer(confirmAll(acceptedDraft), {
      type: "confirmationToggled",
      confirmation: "terms",
      checked: false,
    });

    expect(draftConfirmations(draft)).toEqual({
      ...allConfirmed,
      terms: false,
    });
  });

  test("all six checked are unchanged after a reload", () => {
    const storage = memoryStorage();
    const confirmed = confirmAll(acceptedDraft);
    writeDraft(storage, confirmed);

    expect(draftConfirmations(readDraft(storage))).toEqual(allConfirmed);
  });

  test("a mix of checked and unchecked is unchanged after a reload", () => {
    const storage = memoryStorage();
    const draft = draftReducer(confirmAll(acceptedDraft), {
      type: "confirmationToggled",
      confirmation: "mitZero",
      checked: false,
    });
    writeDraft(storage, draft);

    expect(draftConfirmations(readDraft(storage))).toEqual({
      ...allConfirmed,
      mitZero: false,
    });
  });

  test("an unreadable kept confirmation reads as unchecked", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({
        ...acceptedDraft,
        confirmations: { ...allConfirmed, rights: "yes" },
      }),
    });

    expect(draftConfirmations(readDraft(storage))).toEqual({
      ...allConfirmed,
      rights: false,
    });
  });

  test("are cleared when the code changes and is checked again", () => {
    const draft = recheck(
      confirmAll(acceptedDraft),
      "newer code",
      "chargeCard",
    );

    expect(draftConfirmations(draft)).toEqual({
      rights: false,
      mitZero: false,
      noSecrets: false,
      notMalicious: false,
      noResponsibility: false,
      terms: false,
    });
  });

  test("an edit that leaves the code as it was keeps them", () => {
    const draft = draftReducer(confirmAll(acceptedDraft), {
      type: "codeEdited",
      code: pastedCode,
    });

    expect(draftConfirmations(draft)).toEqual(allConfirmed);
  });
});

describe("a visit to the Terms page and back", () => {
  test("keeps the details, the confirmations and the rest of the draft", () => {
    // The Terms link leaves the Contribute flow, so the flow's provider unmounts. The draft
    // it mirrored is all that comes back when the publisher returns.
    const storage = memoryStorage();
    const draft = confirmAll(
      editDetails(
        { ...acceptedDraft, finished: ["profile", "detected", "details"] },
        { title: "Slack poster", description: "Posts to Slack." },
      ),
    );
    writeDraft(storage, draft);

    const returned = enterDraft(readDraft(storage), undefined);

    expect(returned).toEqual(draft);
    expect(draftDetails(returned)).toEqual({
      title: "Slack poster",
      name: "post-slack-message",
      description: "Posts to Slack.",
    });
    expect(draftConfirmations(returned)).toEqual(allConfirmed);
  });
});

describe("publishing", () => {
  test("empties every field, including the details and confirmations", () => {
    const draft = confirmAll(
      editDetails(acceptedDraft, {
        title: "Slack poster",
        name: "slack-poster",
        description: "Posts to Slack.",
      }),
    );

    const published = draftReducer(draft, { type: "published" });

    expect(published).toEqual(emptyDraft);
    expect(draftDetails(published)).toEqual({
      title: "",
      name: "",
      description: "",
    });
    expect(draftConfirmations(published)).toEqual({
      rights: false,
      mitZero: false,
      noSecrets: false,
      notMalicious: false,
      noResponsibility: false,
      terms: false,
    });
  });

  test("empties the kept details and confirmations", () => {
    const storage = memoryStorage();
    const draft = confirmAll(
      editDetails(acceptedDraft, { title: "Slack poster" }),
    );
    writeDraft(storage, draft);

    writeDraft(storage, draftReducer(draft, { type: "published" }));

    const stored = storage.getItem(draftStorageKey) ?? "";
    expect(stored).not.toContain("Slack poster");
    expect(stored).not.toContain("confirmations");
    expect(readDraft(storage)).toEqual(emptyDraft);
  });
});

describe("a name already used, as publish reports it", () => {
  const refuse = (draft: Draft, name = "post-slack-message") =>
    draftReducer(draft, { type: "nameUsedAtPublish", name });

  test("keeps the name it was given", () => {
    expect(refuse(acceptedDraft, "slack-poster").usedName).toBe("slack-poster");
  });

  test("is kept while the publisher edits the name", () => {
    const edited = editDetails(refuse(acceptedDraft), { name: "slack-poster" });

    expect(edited.usedName).toBe("post-slack-message");
    expect(draftDetails(edited).name).toBe("slack-poster");
  });

  test("is kept while the publisher edits another field", () => {
    expect(
      editDetails(refuse(acceptedDraft), {
        title: "Slack poster",
        description: "Posts.",
      }).usedName,
    ).toBe("post-slack-message");
  });

  test("is kept when the draft reloads, with the rest of the details", () => {
    const storage = memoryStorage();
    const draft = refuse(
      editDetails(acceptedDraft, { description: "Posts to Slack." }),
    );
    writeDraft(storage, draft);

    expect(readDraft(storage)).toEqual(draft);
  });

  test("an unreadable kept name is dropped and the rest of the draft kept", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({ ...acceptedDraft, usedName: true }),
    });

    expect(readDraft(storage)).toEqual(acceptedDraft);
  });

  test("goes when the publisher publishes", () => {
    expect(draftReducer(refuse(acceptedDraft), { type: "published" })).toEqual(
      emptyDraft,
    );
  });
});

describe("Details is finished", () => {
  const continued: Draft = {
    ...acceptedDraft,
    finished: ["profile", "detected", "details"],
  };

  test("once the publisher continued with valid details", () => {
    const draft = editDetails(continued, { description: "Posts to Slack." });

    expect(draftFinished(draft)).toEqual([
      "profile",
      "detected",
      "details",
      "code",
    ]);
  });

  test("not on the word of the finished list alone, while a field is empty", () => {
    // The description starts empty, so the defaults alone are not enough.
    expect(draftFinished(continued)).toEqual(["profile", "detected", "code"]);
  });

  test("not once a field is cleared after continuing", () => {
    const draft = editDetails(continued, {
      description: "Posts to Slack.",
      title: "",
    });

    expect(draftFinished(draft)).not.toContain("details");
  });

  test("not once the name breaks the name rule after continuing", () => {
    const draft = editDetails(continued, {
      description: "Posts to Slack.",
      name: "post-slack-",
    });

    expect(draftFinished(draft)).not.toContain("details");
  });

  test("not before the publisher continued, however valid the details", () => {
    const draft = editDetails(
      { ...acceptedDraft, finished: ["profile", "detected"] },
      { description: "Posts to Slack." },
    );

    expect(draftFinished(draft)).not.toContain("details");
  });
});

describe("a handle taken, as publish reports it", () => {
  const reviewReady: Draft = {
    ...acceptedDraft,
    finished: ["profile", "detected", "details"],
    details: { description: "Posts to Slack." },
    confirmations: { rights: true, terms: true },
  };
  const refuse = (draft: Draft, handle = "ddieruf") =>
    draftReducer(draft, { type: "handleTakenAtPublish", handle });

  test("keeps the handle it was given", () => {
    expect(refuse(reviewReady, "dana").takenHandle).toBe("dana");
  });

  test("makes Profile & Handle unfinished and keeps the other finished steps", () => {
    expect(draftFinished(refuse(reviewReady))).toEqual([
      "detected",
      "details",
      "code",
    ]);
  });

  test("keeps the code, its check, the details and the confirmations", () => {
    const refused = refuse(reviewReady);

    expect(refused.code).toBe(reviewReady.code);
    expect(refused.check).toEqual(reviewReady.check);
    expect(refused.details).toEqual(reviewReady.details);
    expect(refused.confirmations).toEqual(reviewReady.confirmations);
  });

  test("is kept when the draft reloads", () => {
    const storage = memoryStorage();
    const draft = refuse(reviewReady);
    writeDraft(storage, draft);

    expect(readDraft(storage)).toEqual(draft);
  });

  test("an unreadable kept handle is dropped and the rest of the draft kept", () => {
    const storage = memoryStorage({
      [draftStorageKey]: JSON.stringify({ ...acceptedDraft, takenHandle: 7 }),
    });

    expect(readDraft(storage)).toEqual(acceptedDraft);
  });

  test("goes when the publisher publishes", () => {
    expect(draftReducer(refuse(reviewReady), { type: "published" })).toEqual(
      emptyDraft,
    );
  });
});
