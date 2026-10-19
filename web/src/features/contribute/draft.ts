import { contributeOriginSchema } from "@/lib/contribute-origin";
import { z } from "zod";
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
}

/** What the publisher did. A step's form dispatches once it validates. */
export interface DraftAction {
  type: "stepFinished";
  step: StepId;
}

export const emptyDraft: Draft = { finished: [] };

/** The sessionStorage key the draft is mirrored to, so a reload keeps it. */
export const draftStorageKey = "durables.contribute.draft";

const draftSchema = z.object({
  finished: z.array(stepIdSchema),
  // An unreadable origin is dropped rather than losing the rest of the draft.
  origin: contributeOriginSchema.optional().catch(undefined),
});

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "stepFinished":
      return draft.finished.includes(action.step)
        ? draft
        : { ...draft, finished: [...draft.finished, action.step] };
  }
}

/**
 * The draft as the flow opens: the kept draft, with the page the flow was opened from when the
 * link that opened it named one. Without one, the kept origin stays, as after a sign-in
 * provider sends the publisher back.
 */
export function enterDraft(draft: Draft, origin: string | undefined): Draft {
  return origin === undefined ? draft : { ...draft, origin };
}

/** The draft kept in the browser session. An empty draft when none is kept or it is unreadable. */
export function readDraft(storage: Pick<Storage, "getItem">): Draft {
  const stored = storage.getItem(draftStorageKey);
  if (stored === null) return emptyDraft;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : emptyDraft;
  } catch {
    return emptyDraft;
  }
}

/** Keeps the draft in the browser session. */
export function writeDraft(
  storage: Pick<Storage, "setItem">,
  draft: Draft,
): void {
  storage.setItem(draftStorageKey, JSON.stringify(draft));
}
