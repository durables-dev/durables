import { z } from "zod";
import { stepIdSchema, type StepId } from "./steps";

/** The in-progress contribution. Later steps add what they collect. */
export interface Draft {
  /** The steps the publisher has finished, in the order they finished them. */
  finished: StepId[];
}

/** What the publisher did. A step's form dispatches once it validates. */
export interface DraftAction {
  type: "stepFinished";
  step: StepId;
}

export const emptyDraft: Draft = { finished: [] };

/** The sessionStorage key the draft is mirrored to, so a reload keeps it. */
export const draftStorageKey = "durables.contribute.draft";

const draftSchema = z.object({ finished: z.array(stepIdSchema) });

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "stepFinished":
      return draft.finished.includes(action.step)
        ? draft
        : { ...draft, finished: [...draft.finished, action.step] };
  }
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
