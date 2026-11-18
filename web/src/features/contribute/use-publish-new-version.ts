import { api } from "@/lib/api-client";
import { listingQuery } from "@/lib/listing-queries";
import type { NewVersionBase } from "@/lib/new-version-entry";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse, type InferRequestType } from "hono/client";

/**
 * The roots of cached reads a new version changes: browse results, which show each listing's
 * latest version (search: browse-query), and the owner's profile, which lists it (account:
 * profile-queries). Features never import from each other, so the keys are named here.
 */
const browseResultsKey = ["activities"] as const;
const profileKey = ["profile"] as const;

/**
 * What a new version is sent: the code, the title, description, number, base, What changed
 * note and confirmations, and the deprecation of the base when asked for.
 */
export type NewVersionRequest = InferRequestType<
  (typeof api.api.activities)[":handle"][":name"]["versions"]["$post"]
>["json"];

/**
 * Publishes a new version of the base's listing. The answer is the new version's address, not
 * the listing, so the listing is read again. A refusal reads it again too, since a version may
 * have been published since it was read.
 */
export function usePublishNewVersion({ handle, name }: NewVersionBase) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: NewVersionRequest) =>
      parseResponse(
        api.api.activities[":handle"][":name"].versions.$post({
          param: { handle, name },
          json,
        }),
      ),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: browseResultsKey });
      void queryClient.invalidateQueries({ queryKey: profileKey });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: listingQuery({ handle, name }).queryKey,
      });
    },
  });
}
