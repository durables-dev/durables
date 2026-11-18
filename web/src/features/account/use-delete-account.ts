import { api } from "@/lib/api-client";
import { useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

/**
 * Deletes the signed-in owner's account (ADR 0015). The API checks the typed handle again,
 * takes every listed activity out of search and ends the session, then answers 204. What the
 * page does next is the profile page's: it shows the deleted screen and clears the caches.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (handle: string) =>
      parseResponse(api.api.account.$delete({ json: { handle } })),
  });
}
