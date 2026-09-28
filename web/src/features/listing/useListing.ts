import { useEffect, useState } from "react";
import { getListing } from "../../api/activities";
import type { Listing } from "../../api/types";

export type ListingState = { listing: Listing | null; error: string | null };

/** Loads a listing. Without a version, api returns the default (highest) version. */
export function useListing(owner: string, name: string, version?: string): ListingState {
  const [state, setState] = useState<ListingState>({ listing: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ listing: null, error: null });
    getListing(owner, name, version)
      .then((listing) => !cancelled && setState({ listing, error: null }))
      .catch((caught) => !cancelled && setState({ listing: null, error: caught instanceof Error ? caught.message : String(caught) }));
    return () => {
      cancelled = true;
    };
  }, [owner, name, version]);

  return state;
}
