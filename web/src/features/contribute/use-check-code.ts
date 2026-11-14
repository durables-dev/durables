import { api } from "@/lib/api-client";
import { problemFrom } from "@/lib/problem";
import type { SdkName } from "@/lib/sdk-catalog";
import { sessionQuery, signedOut } from "@/lib/session";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useEffect, useRef } from "react";
import {
  checkLine,
  isFileRefusal,
  sdkControl,
  type CheckLine,
  type SdkControl,
} from "./check-line";
import { factsSchema } from "./check-result";
import { useContributeDraft } from "./use-contribute-draft";

export interface CheckCode {
  /** Checks this code. Nothing is sent for an empty editor. */
  check: (code: string) => void;
  /** Checks the code in the editor again, with the SDK the publisher chose. */
  declare: (sdk: SdkName) => void;
  /** What the line under the editor says about the code in it now. */
  line: CheckLine;
  /** Whether the SDK can be changed, or must be chosen. */
  control: SdkControl;
}

/** What a check sends: the code, and the SDK the publisher chose for it, if any. */
interface CheckRequest {
  code: string;
  declaredSdk: SdkName | undefined;
}

/**
 * Runs the detection check on the pasted code and keeps the outcome in the draft. A finished
 * check belongs to the code it checked, so one for older code is dropped. A refusal of the
 * file is kept with the code. A failure that says nothing about the file, such as too many
 * checks or a network error, is shown only while the code is unchanged. Code kept without a
 * result, as after such a failure and a reload, is checked when the step opens. A signed-out
 * answer makes the session anonymous, which sends the publisher to the sign-in step. A check
 * sends the SDK the publisher declared, and its result is kept only while that SDK is still
 * the declared one.
 */
export function useCheckCode(): CheckCode {
  const queryClient = useQueryClient();
  const { draft, dispatch } = useContributeDraft();
  const mutation = useMutation({
    mutationFn: async ({ code, declaredSdk }: CheckRequest) =>
      // A result without what the Found line needs, such as the activity or the SDK, is a
      // failure.
      factsSchema.parse(
        await parseResponse(
          api.api.checks.$post({
            json: declaredSdk === undefined ? { code } : { code, declaredSdk },
          }),
        ),
      ),
    onSuccess: (facts, { code, declaredSdk }) => {
      dispatch({
        type: "checkFinished",
        code,
        declaredSdk,
        result: { outcome: "accepted", facts },
      });
    },
    onError: (error, { code, declaredSdk }) => {
      const problem = problemFrom(error);
      if (problem?.status === 401) {
        queryClient.setQueryData(sessionQuery.queryKey, signedOut);
      } else if (problem && isFileRefusal(problem)) {
        dispatch({
          type: "checkFinished",
          code,
          declaredSdk,
          result: { outcome: "refused", problem },
        });
      }
    },
  });

  // Code the draft kept with no result, such as one whose check failed before a reload, is
  // checked once when the step opens, so the publisher isn't left without a way to retry.
  const { mutate } = mutation;
  const unchecked = draft.check === undefined ? draft.code : undefined;
  const { declaredSdk } = draft;
  const checkedOnOpen = useRef(false);
  useEffect(() => {
    if (checkedOnOpen.current) return;
    checkedOnOpen.current = true;
    if (unchecked !== undefined && unchecked !== "") {
      mutate({ code: unchecked, declaredSdk });
    }
  }, [mutate, unchecked, declaredSdk]);

  // Only the latest check is followed, and only while the editor still holds its code and the
  // SDK it was sent with is still the declared one.
  const sent = mutation.variables;
  const current =
    sent !== undefined &&
    sent.code === draft.code &&
    sent.declaredSdk === declaredSdk;
  const line = checkLine({
    check: draft.check,
    checking: current && mutation.isPending,
    failure:
      current && mutation.isError
        ? (problemFrom(mutation.error) ?? null)
        : undefined,
    declaredSdk,
  });

  return {
    // Code that is only whitespace is sent, with no declared SDK, so the api says it isn't an
    // activity. An empty editor sends nothing.
    check(code) {
      if (code === "") return;
      mutation.mutate({
        code,
        declaredSdk: code.trim() === "" ? undefined : declaredSdk,
      });
    },
    declare(sdk) {
      const code = draft.code ?? "";
      if (code.trim() === "") return;
      dispatch({ type: "sdkDeclared", sdk });
      mutation.mutate({ code, declaredSdk: sdk });
    },
    line,
    control: sdkControl(draft.check, declaredSdk),
  };
}
