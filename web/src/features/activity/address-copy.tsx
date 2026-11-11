import { useState } from "react";
import styles from "./address-copy.module.css";

export const ADDRESS_COPY_FAILED_MESSAGE =
  "Couldn't copy the address. Select it and copy it yourself.";

export interface AddressCopyProps {
  /** The full address, such as ddieruf/charge-card@1.0.0. */
  address: string;
}

// The address in mono type, then a copy icon. A copy shows "Copied" beside it in a status
// region that is in the markup from the start, so it is announced.
export function AddressCopy({ address }: AddressCopyProps) {
  const [outcome, setOutcome] = useState<"copied" | "failed" | null>(null);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setOutcome("copied");
    } catch {
      setOutcome("failed");
    }
  }

  return (
    <div className={styles["row"]}>
      <p className={styles["address"]}>{address}</p>
      <button
        type="button"
        className={styles["copy"]}
        aria-label="Copy address"
        onClick={() => void copyAddress()}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      </button>
      <p
        role="status"
        className={outcome === "copied" ? styles["copied"] : styles["status"]}
      >
        {outcome === "copied" && "Copied"}
        {outcome === "failed" && ADDRESS_COPY_FAILED_MESSAGE}
      </p>
    </div>
  );
}
