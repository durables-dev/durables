import { useEffect, useReducer, type ReactNode } from "react";
import { ContributeDraftContext } from "./contribute-draft-context";
import { draftReducer, enterDraft, readDraft, writeDraft } from "./draft";

export interface ContributeDraftProviderProps {
  children: ReactNode;
  /** The page the flow was opened from, when the link that opened it named one. Read once. */
  entryOrigin?: string | undefined;
}

// Holds the draft for the Contribute flow. It starts from the copy in sessionStorage and
// mirrors every change back there, so a reload keeps it (web/CONVENTIONS.md, State).
export function ContributeDraftProvider({
  children,
  entryOrigin,
}: ContributeDraftProviderProps) {
  const [draft, dispatch] = useReducer(draftReducer, entryOrigin, (origin) =>
    enterDraft(readDraft(sessionStorage), origin),
  );

  useEffect(() => {
    writeDraft(sessionStorage, draft);
  }, [draft]);

  return (
    <ContributeDraftContext value={{ draft, dispatch }}>
      {children}
    </ContributeDraftContext>
  );
}
