import { api } from "@/lib/api-client";
import { problemFrom } from "@/lib/problem";
import { sessionQuery, signedOut } from "@/lib/session";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { checkLine, isFileRefusal, type CheckLine } from "./check-line";
import { factsSchema } from "./check-result";
import { useContributeDraft } from "./use-contribute-draft";

export interface CheckCode {
  /** Checks this code. Nothing is sent for an empty editor. */
  check: (code: string) => void;
  /** What the line under the editor says about the code in it now. */
  line: CheckLine;
}

/**
 * Runs the detection check on the pasted code and keeps the outcome in the draft. A finished
 * check belongs to the code it checked, so one for older code is dropped. A refusal of the
 * file is kept with the code. A failure that says nothing about the file, such as too many
 * checks or a network error, is shown only while the code is unchanged. A signed-out answer
 * makes the session anonymous, which sends the publisher to the sign-in step.
 */
export function useCheckCode(): CheckCode {
  const queryClient = useQueryClient();
  const { draft, dispatch } = useContributeDraft();
  const mutation = useMutation({
    mutationFn: async (code: string) =>
      // A result without what the Found line needs, such as the activity or the SDK, is a
      // failure.
      factsSchema.parse(
        await parseResponse(api.api.checks.$post({ json: { code } })),
      ),
    onSuccess: (facts, code) => {
      dispatch({
        type: "checkFinished",
        code,
        result: { outcome: "accepted", facts },
      });
    },
    onError: (error, code) => {
      const problem = problemFrom(error);
      if (problem?.status === 401) {
        queryClient.setQueryData(sessionQuery.queryKey, signedOut);
      } else if (problem && isFileRefusal(problem)) {
        dispatch({
          type: "checkFinished",
          code,
          result: { outcome: "refused", problem },
        });
      }
    },
  });

  // Only the latest check is followed, and only while the editor still holds its code.
  const current = mutation.variables === draft.code;
  const line = checkLine({
    check: draft.check,
    checking: current && mutation.isPending,
    failure:
      current && mutation.isError
        ? (problemFrom(mutation.error) ?? null)
        : undefined,
  });

  return {
    check(code) {
      if (code.trim() === "") return;
      mutation.mutate(code);
    },
    line,
  };
}
