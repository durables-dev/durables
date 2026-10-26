import { api } from "@/lib/api-client";
import { sessionQuery, type Session } from "@/lib/session";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse, type InferRequestType } from "hono/client";

/** What publish is sent: the code, the listing details and the six confirmations. */
export type PublishRequest = InferRequestType<
  typeof api.api.activities.$post
>["json"];

/**
 * Publishes the activity. The answer says the publisher's account now exists, so the cached
 * session says so at once, and is then read again.
 */
export function usePublish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: PublishRequest) =>
      parseResponse(api.api.activities.$post({ json: request })),
    onSuccess: async (published) => {
      queryClient.setQueryData(
        sessionQuery.queryKey,
        (cached): Session | undefined =>
          cached?.user
            ? {
                user: {
                  ...cached.user,
                  handle: published.handle,
                  accountExists: true,
                },
              }
            : cached,
      );
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    },
  });
}
