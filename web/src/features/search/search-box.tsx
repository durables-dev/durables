import { SearchField } from "@/components/search-field";
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
  function submit(form: FormData) {
    const typed = form.get("q");
    onSubmit(typeof typed === "string" ? typed : "");
  }

  return (
    <form role="search" action={submit} className={styles["form"]}>
      <SearchField key={words} defaultValue={words} className={styles["box"]} />
    </form>
  );
}
