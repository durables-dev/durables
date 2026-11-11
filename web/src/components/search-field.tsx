import { useId, type ReactNode } from "react";
import styles from "./search-field.module.css";

export interface SearchFieldProps {
  /** The words the field starts with. Empty when left out. */
  defaultValue?: string | undefined;
  /** The page's own shape for the box: its corners, padding and width. */
  className?: string | undefined;
  /** Controls inside the box after the input, such as the home page's Filters button. */
  children?: ReactNode;
}

// The search box shared by the home page and the results page: the icon, the hidden "Search
// activities" label and the `q` input, then any controls the page puts inside the box. The
// page supplies the form around it and the box's shape.
export function SearchField({
  defaultValue,
  className,
  children,
}: SearchFieldProps) {
  const inputId = useId();
  const boxClass =
    className === undefined ? styles["box"] : `${styles["box"]} ${className}`;
  return (
    <div className={boxClass}>
      <svg
        className={styles["icon"]}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4.2-4.2" />
      </svg>
      <label htmlFor={inputId} className={styles["label"]}>
        Search activities
      </label>
      <input
        id={inputId}
        name="q"
        type="search"
        className={styles["input"]}
        defaultValue={defaultValue}
        placeholder="Describe what you need, or just use Filters"
        autoComplete="off"
      />
      {children}
    </div>
  );
}
