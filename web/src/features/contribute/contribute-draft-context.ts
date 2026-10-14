import { createContext, type Dispatch } from "react";
import type { Draft, DraftAction } from "./draft";

export interface ContributeDraftValue {
  draft: Draft;
  dispatch: Dispatch<DraftAction>;
}

/** The Contribute flow's draft. Provided by ContributeDraftProvider. */
export const ContributeDraftContext =
  createContext<ContributeDraftValue | null>(null);
