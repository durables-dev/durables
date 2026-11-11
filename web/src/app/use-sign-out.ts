import { signedOut, signOut, sessionQuery } from "@/lib/session";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Signs the publisher out. On success the cached session becomes anonymous at once. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.setQueryData(sessionQuery.queryKey, signedOut);
    },
  });
}
