import { useEffect, useRef } from "react";

/** How long typing has to stop before a check is requested (API map row D6). */
export const checkPauseMs = 1500;

export interface CheckRequest {
  /** Requests a check of this code at once, and drops any wait in progress. */
  now: (code: string) => void;
  /** Requests a check of this code once the pause passes with no further call. */
  afterPause: (code: string) => void;
}

/**
 * When to ask for a check. A paste asks at once. Typing asks once it stops for the pause, and
 * each keystroke restarts the wait. A wait in progress is dropped when the editor goes away.
 */
export function useCheckRequest(onCheck: (code: string) => void): CheckRequest {
  const timer = useRef<number | undefined>(undefined);

  // The timer is outside React, so it is cleared with the component.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function cancel() {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }

  return {
    now(code) {
      cancel();
      onCheck(code);
    },
    afterPause(code) {
      cancel();
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        onCheck(code);
      }, checkPauseMs);
    },
  };
}
