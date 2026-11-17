import { isProfilePath } from "@/lib/account-paths";
import { signedOut, signOut, sessionQuery } from "@/lib/session";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";

/**
 * The root of the profile's cached reads, which carry the owner's email (account:
 * profile-queries). Features never import into app shared hooks, so the key is named here.
 */
const profileKey = ["profile"] as const;

/**
 * Signs the publisher out. On success the cached session becomes anonymous at once, and the
 * publisher stays on the page they were on. On the profile they go to the home page first, so
 * the profile never shows to a signed-out visitor, and the cached profile is dropped so a later
 * visit to it in the same tab never shows the last owner's details.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      if (isProfilePath(pathname)) {
        await navigate("/");
      }
      queryClient.setQueryData(sessionQuery.queryKey, signedOut);
      queryClient.removeQueries({ queryKey: profileKey });
    },
  });
}
