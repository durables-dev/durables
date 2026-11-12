import { useRef } from "react";
import { BasicsDialog } from "./basics-dialog";
import styles from "./basics-links.module.css";

interface Basic {
  label: string;
  docsHref: string;
  docsLabel: string;
  paragraphs: readonly string[];
}

// The text is the home canvas's (Main.dc.html on DUR-1), except that the activity
// explanation no longer says Durables reports whether an activity is safe to run twice:
// behaviour checks (capability row 7) are a later increment.
const basics: readonly Basic[] = [
  {
    label: "What is Temporal?",
    docsHref: "https://docs.temporal.io/",
    docsLabel: "Read the Temporal docs",
    paragraphs: [
      "Temporal is an open-source platform for durable execution. You write a process as ordinary code, called a workflow, and Temporal keeps it running through crashes, restarts and outages. It records each step, retries what fails, and picks up where it left off, whether the process takes seconds or months.",
      "Durables is a community project for Temporal developers. It isn’t made or endorsed by Temporal Technologies.",
    ],
  },
  {
    label: "What is an activity?",
    docsHref: "https://docs.temporal.io/activities",
    docsLabel: "Activities in the Temporal docs",
    paragraphs: [
      "A workflow decides what happens; activities do the work. An activity is a single function that reaches the outside world: charging a card, sending an email, writing to a database. Those calls can fail, so Temporal retries activities automatically. That’s why it matters whether an activity is safe to run twice.",
      "Durables lists activities one at a time, so you can copy the one you need into your own worker.",
    ],
  },
];

// "What is Temporal?" and "What is an activity?" under the home page's headline. Each opens
// its explanation; however the dialog closes, focus goes back to the button that opened it.
export function BasicsLinks() {
  return (
    <div className={styles["links"]}>
      {basics.map((basic) => (
        <BasicsLink key={basic.label} basic={basic} />
      ))}
    </div>
  );
}

interface BasicsLinkProps {
  basic: Basic;
}

function BasicsLink({ basic }: BasicsLinkProps) {
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        ref={opener}
        type="button"
        className={styles["link"]}
        onClick={() => {
          dialog.current?.showModal();
        }}
      >
        {basic.label}
      </button>
      <BasicsDialog
        dialogRef={dialog}
        onClose={() => {
          opener.current?.focus();
        }}
        title={basic.label}
        docsHref={basic.docsHref}
        docsLabel={basic.docsLabel}
      >
        {basic.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </BasicsDialog>
    </>
  );
}
