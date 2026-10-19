import { handlePattern } from "@durables/schemas";
import type { Provider } from "../storage/storage";

// The handle suggested on the handle step, taken from the provider account at sign-in (API map
// T12, D18). GitHub and GitLab suggest the account username. Google and Microsoft have no
// username, so they suggest the part of the email before the @.
//
// The suggestion is only a starting point. It is not checked against the reserved words or the
// handles in use: the handle step reports availability. The email is read here and never
// returned, kept or logged.

/** The longest handle the format rule allows. */
export const handleMaxLength = 39;

/** The shortest handle the format rule allows. */
export const handleMinLength = 3;

/**
 * Every run of characters the format rule does not allow in a handle. A hyphen is one of them
 * here, so replacing each run with one hyphen also collapses repeated hyphens.
 */
const disallowedCharacters = /[^a-z0-9]+/gu;

/** Hyphens at the start or end. */
const edgeHyphens = /^-+|-+$/gu;

/**
 * Cleans text to fit the handle format rule: lowercased, every disallowed character replaced
 * with a hyphen, repeated hyphens collapsed, leading and trailing hyphens trimmed, and cut to
 * 39 characters. Undefined when what is left is shorter than 3 characters.
 */
export const cleanHandle = (source: string): string | undefined => {
  const cleaned = source
    .toLowerCase()
    .replace(disallowedCharacters, "-")
    .replace(edgeHyphens, "")
    .slice(0, handleMaxLength)
    // Cutting can leave a hyphen at the end.
    .replace(edgeHyphens, "");
  if (cleaned.length < handleMinLength || !handlePattern.test(cleaned)) {
    return undefined;
  }
  return cleaned;
};

/** The part of an email address before the @, or undefined when it has none. */
const localPart = (email: string): string | undefined => {
  const at = email.lastIndexOf("@");
  return at < 0 ? undefined : email.slice(0, at);
};

/** The parts of a provider identity a suggestion is taken from. */
export interface SuggestionSource {
  provider: Provider;
  username?: string | undefined;
  email?: string | undefined;
}

/** The text each provider's suggestion is taken from, before it is cleaned. */
const sourceText = ({
  provider,
  username,
  email,
}: SuggestionSource): string | undefined => {
  switch (provider) {
    case "github":
    case "gitlab":
      return username;
    case "google":
    case "microsoft":
      return email === undefined ? undefined : localPart(email);
  }
};

/**
 * The handle to suggest for a provider identity, cleaned to fit the format rule, or undefined
 * when the identity has nothing that cleans to a valid handle.
 */
export const suggestHandle = (
  identity: SuggestionSource,
): string | undefined => {
  const source = sourceText(identity);
  return source === undefined ? undefined : cleanHandle(source);
};
