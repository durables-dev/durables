import { useEffect, useState } from "react";
import { getGroupListing } from "../../api/groups";
import type { GroupListing } from "../../api/types";

export type GroupListingState = { listing: GroupListing | null; error: string | null };

/** Loads a group listing. Without a version, api returns the default (highest) version. */
export function useGroupListing(owner: string, name: string, version?: string): GroupListingState {
  const [state, setState] = useState<GroupListingState>({ listing: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ listing: null, error: null });
    getGroupListing(owner, name, version)
      .then((listing) => !cancelled && setState({ listing, error: null }))
      .catch((caught) => !cancelled && setState({ listing: null, error: caught instanceof Error ? caught.message : String(caught) }));
    return () => {
      cancelled = true;
    };
  }, [owner, name, version]);

  return state;
}
