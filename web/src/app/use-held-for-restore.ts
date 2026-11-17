import { restorePromptPath } from "@/lib/account-paths";
import { sessionQuery } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router";

/**
 * Whether this page must lead back to the Restore prompt. True while a sign-in is held for the
 * Restore choice, because its account is pending deletion, on every page but the prompt itself
 * (ADR 0015). Nothing else on the site is reachable as that account until it is restored or
 * started over.
 */
export function useHeldForRestore(): boolean {
  const { data } = useQuery(sessionQuery);
  const { pathname } = useLocation();
  return data?.restore !== undefined && pathname !== restorePromptPath;
}
