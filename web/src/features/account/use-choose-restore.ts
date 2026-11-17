import { newUserPath, profilePath } from "@/lib/account-paths";
import { accountRestoredState } from "@/lib/account-restored";
import { api } from "@/lib/api-client";
import { sessionQuery } from "@/lib/session";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useNavigate } from "react-router";
import type { RestoreChoiceName } from "./restore-choice";

/**
 * Makes the Restore prompt's choice (ADR 0015). Either answer is the new session, which
 * replaces the cached one at once, so the frame stops leading back to the prompt. Restore then
 * goes to the profile with the restored message. Start as a new user goes into Contribute at
 * Profile & Handle.
 */
export function useChooseRestore() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (choice: RestoreChoiceName) =>
      parseResponse(
        choice === "restore"
          ? api.api.session.restore.$post()
          : api.api.session["start-over"].$post(),
      ),
    onSuccess: async (session, choice) => {
      queryClient.setQueryData(sessionQuery.queryKey, session);
      await (choice === "restore"
        ? navigate(profilePath, { state: accountRestoredState })
        : navigate(newUserPath));
    },
  });
}
