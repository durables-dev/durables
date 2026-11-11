import {
  publishConfirmationKeys,
  type PublishConfirmationKey,
} from "@durables/schemas";

const texts: Record<PublishConfirmationKey, string> = {
  rights:
    "I wrote this code, or I own the copyright or have permission to publish it.",
  mitZero:
    "I'm publishing it under MIT-0: anyone may use, change and share it, with no attribution and no warranty.",
  noSecrets: "It contains no secrets, credentials, keys or personal data.",
  notMalicious:
    "It isn't malicious and doesn't knowingly harm the systems it runs on.",
  noResponsibility:
    "I understand Durables doesn't review or warrant published code and takes no responsibility for it. I'm responsible for what I publish.",
  terms: "I agree to the Durables Terms.",
};

/** The six confirmations on the Review step, in the order the page shows them. */
export const reviewConfirmations: readonly {
  key: PublishConfirmationKey;
  text: string;
}[] = publishConfirmationKeys.map((key) => ({ key, text: texts[key] }));
