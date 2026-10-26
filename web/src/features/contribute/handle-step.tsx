import type { SessionUser } from "@/lib/session";
import { handleFormatSchema, handleInvalidMessage } from "@durables/schemas";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useActionState, useId, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import {
  handleAvailabilityQuery,
  type HandleAvailabilityResponse,
} from "./handle-availability";
import {
  canSaveHandle,
  handleSaveRefusal,
  handleStatus,
  needsLookup,
  type HandleLookup,
  type HandleStatus,
} from "./handle-status";
import styles from "./handle-step.module.css";
import { lowercaseAsTyped } from "./lowercase-as-typed";
import { signInProviders } from "./sign-in-providers";
import { signInAgainPath } from "./sign-in-view";
import { StepFooter } from "./step-footer";
import stepStyles from "./step.module.css";
import { stepPath } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";
import { useFocusOnAppear } from "./use-focus-on-appear";
import { useSaveHandle } from "./use-save-handle";

export interface HandleStepProps {
  /** The signed-in publisher, who has no account yet. */
  user: SessionUser;
}

/** A save that did not go through, and the handle it was for. */
interface SaveRefusal {
  handle: string;
  status: HandleStatus;
}

/** The example activity name in the first-address preview. */
const exampleActivity = "my-activity@1.0.0";

// The handle step: the publisher chooses the permanent handle that starts every address they
// publish. The field starts with the handle already chosen, or else the suggestion from the
// provider account, and is checked as they type. Continue saves it to the session and opens
// Code. Back returns to the sign-in step, still signed in.
export function HandleStep({ user }: HandleStepProps) {
  const navigate = useNavigate();
  const { dispatch } = useContributeDraft();
  const heading = useFocusOnAppear<HTMLHeadingElement>();
  const fieldId = useId();
  const statusId = useId();
  const helpId = useId();
  const [handle, setHandle] = useState(
    user.handle ?? user.suggestedHandle ?? "",
  );
  const lookup = useQuery({
    ...handleAvailabilityQuery(handle),
    enabled: needsLookup(handle),
  });
  const save = useSaveHandle();

  const [refusal, saveAction, isSaving] = useActionState(
    async (
      _previous: SaveRefusal | null,
      form: FormData,
    ): Promise<SaveRefusal | null> => {
      const value = form.get("handle");
      const chosen = typeof value === "string" ? value : "";
      if (!handleFormatSchema.safeParse(chosen).success) {
        return {
          handle: chosen,
          status: { kind: "invalid", message: handleInvalidMessage(chosen) },
        };
      }
      try {
        await save.mutateAsync(chosen);
      } catch (error) {
        return { handle: chosen, status: handleSaveRefusal(chosen, error) };
      }
      dispatch({ type: "stepFinished", step: "profile" });
      await navigate(stepPath("code"));
      return null;
    },
    null,
  );

  const status =
    refusal?.handle === handle
      ? refusal.status
      : handleStatus(handle, lookupOf(lookup));
  const ready = canSaveHandle(status) && !isSaving;
  const provider = signInProviders.find(({ id }) => id === user.provider);

  function onHandleChange(event: ChangeEvent<HTMLInputElement>) {
    setHandle(lowercaseAsTyped(event.currentTarget));
  }

  return (
    <form action={saveAction} className={styles["step"]}>
      <div className={styles["intro"]}>
        <h2 ref={heading} tabIndex={-1} className={stepStyles["heading"]}>
          Choose your handle
        </h2>
        <p className={styles["lede"]}>
          Your handle is the first part of every address you publish.{" "}
          <strong>It can&apos;t be changed later</strong>, because published
          addresses never change.
        </p>
      </div>
      <div className={styles["field"]}>
        <label htmlFor={fieldId} className={styles["label"]}>
          Handle
        </label>
        <div className={styles["control"]}>
          <span className={styles["prefix"]}>durables.dev/</span>
          <input
            id={fieldId}
            name="handle"
            type="text"
            value={handle}
            onChange={onHandleChange}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={`${statusId} ${helpId}`}
            className={styles["input"]}
          />
        </div>
        <div className={styles["check"]}>
          <p
            id={statusId}
            role="status"
            className={styles["status"]}
            data-kind={status.kind}
          >
            {status.message}
          </p>
          {status.kind === "failed" ? (
            <button
              type="button"
              className={styles["retry"]}
              onClick={() => {
                void lookup.refetch();
              }}
            >
              Try again
            </button>
          ) : null}
        </div>
        <p id={helpId} className={styles["help"]}>
          3 to 39 characters: lowercase letters, numbers and single hyphens.
          {user.suggestedHandle !== undefined && provider
            ? ` Suggested from your ${provider.name} account.`
            : null}
        </p>
      </div>
      <div className={styles["preview"]}>
        <p className={styles["previewLabel"]}>
          Your first address will look like
        </p>
        <p className={styles["address"]}>
          durables.dev/
          <span className={styles["addressHandle"]}>
            {handle === "" ? "your-handle" : handle}
          </span>
          /{exampleActivity}
        </p>
      </div>
      <StepFooter
        onBack={() => {
          void navigate(signInAgainPath);
        }}
        hint={ready ? undefined : "Choose an available handle"}
        continueDisabled={!ready}
      />
    </form>
  );
}

/** Where the lookup for the handle in the field has got to. A retry reads as checking. */
function lookupOf(
  query: UseQueryResult<HandleAvailabilityResponse>,
): HandleLookup {
  if (query.isSuccess) {
    return { state: "answered", availability: query.data.availability };
  }
  if (query.isError && !query.isFetching) {
    return { state: "failed" };
  }
  return { state: "pending" };
}
