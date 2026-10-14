// The badge in the header shows the publisher's initials, taken from the name on their
// provider account (API map D2). Never the avatar.

const firstLetterOrDigit = /[\p{L}\p{N}]/u;

/**
 * The first letter of the first and last words of a name, uppercased: "David Dieruf" is "DD"
 * and "Ada" is "A". Words with no letter or digit are skipped. A name with none at all is "?".
 */
export const initials = (name: string): string => {
  const letters = name
    .split(/\s+/u)
    .map((word) => firstLetterOrDigit.exec(word)?.[0])
    .filter((letter) => letter !== undefined);
  const first = letters.at(0);
  if (first === undefined) {
    return "?";
  }
  const last = letters.length > 1 ? (letters.at(-1) ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase();
};
