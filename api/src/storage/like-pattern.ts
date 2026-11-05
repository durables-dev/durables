// Search words become SQL LIKE patterns. Every character in a word matches itself, including the
// pattern characters % and _, so a typed word is never read as a wildcard.

/** The escape character the patterns use. Queries name it in their ESCAPE clause. */
export const LIKE_ESCAPE = "\\";

/** A LIKE pattern matching any text that contains the word, character for character. */
export const containsPattern = (word: string): string =>
  `%${word.replace(/[\\%_]/g, (character) => `${LIKE_ESCAPE}${character}`)}%`;
