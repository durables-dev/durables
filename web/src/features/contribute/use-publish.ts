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
 * session says so at once. The session is then read again in the background; a successful
 * publish does not wait for that read.
 */
export function usePublish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: PublishRequest) =>
      parseResponse(api.api.activities.$post({ json: request })),
    onSuccess: (published) => {
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
      void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    },
  });
}
