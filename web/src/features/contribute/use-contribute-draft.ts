import { use } from "react";
import {
  ContributeDraftContext,
  type ContributeDraftValue,
} from "./contribute-draft-context";

/** The Contribute flow's draft and its dispatch. Throws outside ContributeDraftProvider. */
export function useContributeDraft(): ContributeDraftValue {
  const value = use(ContributeDraftContext);
  if (!value) {
    throw new Error(
      "useContributeDraft must be used inside ContributeDraftProvider",
    );
  }
  return value;
}
