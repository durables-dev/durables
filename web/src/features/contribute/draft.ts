import { contributeOriginSchema } from "@/lib/contribute-origin";
import { z } from "zod";
import { checkResultSchema, type CheckResult } from "./check-result";
import { stepIdSchema, type StepId } from "./steps";

/** The in-progress contribution. Later steps add what they collect. */
export interface Draft {
  /** The steps the publisher has finished, in the order they finished them. */
  finished: StepId[];
  /**
   * The page the publisher opened the flow from. Back on the sign-in step returns there. It is
   * kept with the draft so it survives the round trip to a sign-in provider.
   */
  origin?: string | undefined;
  /** The code in the Code step's editor, exactly as pasted. */
  code?: string | undefined;
  /** The latest check of `code`. It goes whenever the code changes. */
  check?: CheckResult | undefined;
}

/**
 * What the publisher did. A step's form dispatches once it validates. A finished check is
 * for the code it checked, and is dropped if the code has changed since.
 */
export type DraftAction =
  | { type: "stepFinished"; step: StepId }
  | { type: "codeEdited"; code: string }
  | { type: "checkFinished"; code: string; result: CheckResult }
  | { type: "published" };

export const emptyDraft: Draft = { finished: [] };

/** The sessionStorage key the draft is mirrored to, so a reload keeps it. */
export const draftStorageKey = "durables.contribute.draft";

const draftSchema = z.object({
  finished: z.array(stepIdSchema),
  // An unreadable origin is dropped rather than losing the rest of the draft.
  origin: contributeOriginSchema.optional().catch(undefined),
  code: z.string().optional(),
  // An unreadable check is dropped and the code kept, so the check can run again.
  check: checkResultSchema.optional().catch(undefined),
});

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "stepFinished":
      return draft.finished.includes(action.step)
        ? draft
        : { ...draft, finished: [...draft.finished, action.step] };
    case "codeEdited":
      return action.code === (draft.code ?? "")
        ? draft
        : { ...draft, code: action.code, check: undefined };
    case "checkFinished":
      return action.code === draft.code
        ? { ...draft, check: action.result }
        : draft;
    case "published":
      return emptyDraft;
  }
}

/** The pasted code has been checked and accepted. */
export function isAccepted(draft: Draft): boolean {
  return draft.check?.outcome === "accepted";
}

/**
 * The steps the draft has finished. Code is finished while the pasted code is accepted, and
 * at no other time.
 */
export function draftFinished(draft: Draft): StepId[] {
  const others = draft.finished.filter((step) => step !== "code");
  return isAccepted(draft) ? [...others, "code"] : others;
}

/**
 * The draft as the flow opens: the kept draft, with the page the flow was opened from when the
 * link that opened it named one. Without one, the kept origin stays, as after a sign-in
 * provider sends the publisher back.
 */
export function enterDraft(draft: Draft, origin: string | undefined): Draft {
  return origin === undefined ? draft : { ...draft, origin };
}

/**
 * The browser session's storage, or undefined when the browser does not allow it. Reading
 * `sessionStorage` itself throws when storage is turned off.
 */
export function sessionStorageIfAvailable(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * The draft kept in the browser session. An empty draft when none is kept, it is unreadable,
 * or the storage cannot be read.
 */
export function readDraft(
  storage: Pick<Storage, "getItem"> | undefined,
): Draft {
  try {
    const stored = storage?.getItem(draftStorageKey) ?? null;
    if (stored === null) return emptyDraft;
    const parsed = draftSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) return emptyDraft;
    // A check belongs to the code it checked. With no code kept, it is dropped.
    const draft = parsed.data;
    return draft.check !== undefined && !draft.code
      ? { ...draft, check: undefined }
      : draft;
  } catch {
    return emptyDraft;
  }
}

/**
 * Keeps the draft in the browser session. When the storage cannot be written, the draft
 * lives on in the page without it.
 */
export function writeDraft(
  storage: Pick<Storage, "setItem"> | undefined,
  draft: Draft,
): void {
  try {
    storage?.setItem(draftStorageKey, JSON.stringify(draft));
  } catch {
    // Full or refused storage: a reload starts the draft again, and nothing else is lost.
  }
}
