import { useId } from "react";
import styles from "./search-box.module.css";

export interface SearchBoxProps {
  /** The words the address holds. */
  words: string;
  /** Called with the words in the box when Enter is pressed. */
  onSubmit: (words: string) => void;
}

// The results page's search box. It shows the words searched for and can be changed. Typing
// sends nothing; pressing Enter submits the words. When the address's words change, as Clear
// filters or Back can do, the box starts again from them.
export function SearchBox({ words, onSubmit }: SearchBoxProps) {
  const inputId = useId();

  function submit(form: FormData) {
    const typed = form.get("q");
    onSubmit(typeof typed === "string" ? typed : "");
  }

  return (
    <form role="search" action={submit} className={styles["box"]}>
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
        key={words}
        id={inputId}
        name="q"
        type="search"
        className={styles["input"]}
        defaultValue={words}
        placeholder="Describe what you need, or just use Filters"
        autoComplete="off"
      />
    </form>
  );
}
