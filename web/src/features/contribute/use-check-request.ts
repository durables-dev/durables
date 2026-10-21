import { useEffect, useRef } from "react";

/** How long typing must pause before a check is requested. */
export const CHECK_PAUSE_MS = 1500;

interface PendingCheck {
  timer: ReturnType<typeof setTimeout> | undefined;
}

export interface CheckRequest {
  /** Request a check of `code` at once, dropping any check still waiting. */
  now: (code: string) => void;
  /** Request a check of `code` once typing pauses. Each call restarts the wait. */
  afterPause: (code: string) => void;
}

// Decides when the editor asks its parent to check the code: at once on paste, and after
// a pause in typing. A wait still pending when the editor unmounts is dropped.
export function useCheckRequest(onCheck: (code: string) => void): CheckRequest {
  const pending = useRef<PendingCheck>({ timer: undefined });

  useEffect(() => {
    const current = pending.current;
    return () => {
      clearTimeout(current.timer);
    };
  }, []);

  function cancel() {
    clearTimeout(pending.current.timer);
    pending.current.timer = undefined;
  }

  return {
    now(code) {
      cancel();
      onCheck(code);
    },
    afterPause(code) {
      cancel();
      pending.current.timer = setTimeout(() => {
        pending.current.timer = undefined;
        onCheck(code);
      }, CHECK_PAUSE_MS);
    },
  };
}
