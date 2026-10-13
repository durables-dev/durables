import { useEffect, useReducer, type ReactNode } from "react";
import { ContributeDraftContext } from "./contribute-draft-context";
import { draftReducer, readDraft, writeDraft } from "./draft";

export interface ContributeDraftProviderProps {
  children: ReactNode;
}

// Holds the draft for the Contribute flow. It starts from the copy in sessionStorage and
// mirrors every change back there, so a reload keeps it (web/CONVENTIONS.md, State).
export function ContributeDraftProvider({
  children,
}: ContributeDraftProviderProps) {
  const [draft, dispatch] = useReducer(draftReducer, sessionStorage, readDraft);

  useEffect(() => {
    writeDraft(sessionStorage, draft);
  }, [draft]);

  return (
    <ContributeDraftContext value={{ draft, dispatch }}>
      {children}
    </ContributeDraftContext>
  );
}
