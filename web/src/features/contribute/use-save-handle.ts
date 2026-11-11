import { api } from "@/lib/api-client";
import { sessionQuery, type Session } from "@/lib/session";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

/**
 * Saves the chosen handle to the session. The answer is written into the cached session. The
 * suggestion is kept from the session read, since the save does not return it.
 */
export function useSaveHandle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) =>
      parseResponse(api.api.session.handle.$put({ json: { handle } })),
    onSuccess: (saved) => {
      queryClient.setQueryData(sessionQuery.queryKey, (cached): Session =>
        saved.user && cached?.user
          ? { user: { ...cached.user, ...saved.user } }
          : saved,
      );
    },
  });
}
