import {
  listingNameMaxLength,
  listingNamePattern,
  listingTitleMaxLength,
} from "@durables/schemas";

// The title and name the Details step starts from, made from the activity's name. Every
// naming style is split into words the same way: `post_slack_message`, `chargeCard` and
// `ChargeCard` all become lowercase words, then a sentence-case title and a hyphenated name.

/**
 * A word is one of: a capital followed by lowercase letters (`Charge`), a run of capitals not
 * followed by a lowercase letter (`HTTP` in `HTTPServer`), or lowercase letters on their own.
 * Digits stay with the letters before them (`s3`, `V2`). A run of digits alone is a word.
 * Anything else, such as `_`, `-` or `$`, separates words.
 */
const wordPattern =
  /[\p{Lu}\p{Lt}]?[\p{Ll}\p{Lo}\p{Lm}]+\p{Nd}*|[\p{Lu}\p{Lt}]+\p{Nd}*(?![\p{Ll}\p{Lo}\p{Lm}])|\p{Nd}+/gu;

/** The activity's name split into lowercase words. */
export function activityNameWords(activityName: string): string[] {
  return (activityName.match(wordPattern) ?? []).map((word) =>
    word.toLowerCase(),
  );
}

/**
 * The default title: the words in sentence case, cut to the longest title allowed.
 * `post_slack_message` gives "Post slack message". Empty when the name has no words.
 */
export function defaultTitle(activityName: string): string {
  const sentence = activityNameWords(activityName).join(" ");
  const title = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return title.slice(0, listingTitleMaxLength).trimEnd();
}

/**
 * The default name in the address: the words joined by hyphens, with accents removed and any
 * other character the name rule refuses left out. A name over 64 characters is cut to 64. A
 * name that still breaks the rule, such as one under 3 characters, gives no default.
 */
export function defaultName(activityName: string): string {
  const words = activityNameWords(activityName)
    .map((word) =>
      word
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-z0-9]/g, ""),
    )
    .filter((word) => word !== "");
  const name = words
    .join("-")
    .slice(0, listingNameMaxLength)
    .replace(/-+$/, "");
  return listingNamePattern.test(name) ? name : "";
}
