import { useEffect, useRef, type RefObject } from "react";

/**
 * A ref for a step's heading. The heading takes focus when the step appears, so a screen
 * reader starts there (web/CONVENTIONS.md, Accessibility). Give the element tabIndex={-1}.
 */
export function useFocusOnAppear<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return ref;
}
