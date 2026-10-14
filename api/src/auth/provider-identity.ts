import { z } from "zod";
import type { SessionIdentity } from "./auth";
import type { OAuthProvider } from "./oauth-providers";

// Turns the user record a provider returns into the identity a session starts with (ADR 0007):
// name, email, avatar and the provider's account ID. Nothing else is kept.
//
// The name is never an email address, because the session read returns the name and must
// never return the email. A record with no account ID or no usable name is not an identity.

const optionalText = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? undefined : trimmed;
  });

const looksLikeEmail = (value: string | undefined): value is string =>
  value?.includes("@") ?? false;

/** The first candidate that is present and is not an email address. */
const displayName = (
  ...candidates: (string | undefined)[]
): string | undefined =>
  candidates.find(
    (candidate) => candidate !== undefined && !looksLikeEmail(candidate),
  );

/** GitHub's GET /user, with the primary email the package adds. */
const gitHubUser = z.object({
  id: z.union([z.number().int(), z.string().min(1)]),
  login: optionalText,
  name: optionalText,
  email: optionalText,
  avatar_url: optionalText,
});

/** Google's userinfo. */
const googleUser = z.object({
  id: z.string().min(1),
  name: optionalText,
  given_name: optionalText,
  email: optionalText,
  picture: optionalText,
});

/** Microsoft Graph's GET /me. Personal accounts often have no mail, only a principal name. */
const microsoftUser = z.object({
  id: z.string().min(1),
  displayName: optionalText,
  givenName: optionalText,
  mail: optionalText,
  userPrincipalName: optionalText,
});

interface IdentityFields {
  providerAccountId: string;
  name: string | undefined;
  email: string | undefined;
  avatarUrl: string | undefined;
}

const fieldsFor = (
  provider: OAuthProvider,
  user: unknown,
): IdentityFields | undefined => {
  switch (provider) {
    case "github": {
      const parsed = gitHubUser.safeParse(user);
      if (!parsed.success) {
        return undefined;
      }
      const { id, login, name, email, avatar_url } = parsed.data;
      return {
        providerAccountId: String(id),
        name: displayName(name, login),
        email,
        avatarUrl: avatar_url,
      };
    }
    case "google": {
      const parsed = googleUser.safeParse(user);
      if (!parsed.success) {
        return undefined;
      }
      const { id, name, given_name, email, picture } = parsed.data;
      return {
        providerAccountId: id,
        name: displayName(name, given_name),
        email,
        avatarUrl: picture,
      };
    }
    case "microsoft": {
      const parsed = microsoftUser.safeParse(user);
      if (!parsed.success) {
        return undefined;
      }
      const { id, mail, userPrincipalName } = parsed.data;
      return {
        providerAccountId: id,
        name: displayName(parsed.data.displayName, parsed.data.givenName),
        email:
          mail ??
          (looksLikeEmail(userPrincipalName) ? userPrincipalName : undefined),
        avatarUrl: undefined,
      };
    }
  }
};

/**
 * The session identity in a provider's user record, or undefined when the record has no
 * account ID or no name. A missing email or avatar is left out rather than failing sign-in.
 */
export const identityFromProviderUser = (
  provider: OAuthProvider,
  user: unknown,
): SessionIdentity | undefined => {
  const fields = fieldsFor(provider, user);
  if (fields?.name === undefined) {
    return undefined;
  }
  return {
    provider,
    providerAccountId: fields.providerAccountId,
    name: fields.name,
    ...(fields.email === undefined ? {} : { email: fields.email }),
    ...(fields.avatarUrl === undefined ? {} : { avatarUrl: fields.avatarUrl }),
  };
};
