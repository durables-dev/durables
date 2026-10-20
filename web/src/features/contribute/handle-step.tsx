import styles from "./step.module.css";
import { useFocusOnAppear } from "./use-focus-on-appear";

// The handle step's slot, where a signed-in publisher with no account lands. The handle step
// story fills it in.
export function HandleStep() {
  const heading = useFocusOnAppear<HTMLHeadingElement>();

  return (
    <h2 ref={heading} tabIndex={-1} className={styles["heading"]}>
      Choose your handle
    </h2>
  );
}
