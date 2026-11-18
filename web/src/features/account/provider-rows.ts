import { signInProviders, type SignInProvider } from "@/lib/sign-in-providers";
import type { ProviderDetails } from "./profile-queries";

/** One row of the From {provider} card. */
export interface ProviderRow {
  label: string;
  /** The value, or null when the provider did not give one. */
  value: string | null;
  /** Shown in monospace: identifiers rather than words. */
  mono: boolean;
}

/** The providers whose accounts have no username, so the card leaves that row out. */
const providersWithoutUsernames: readonly SignInProvider[] = [
  "google",
  "microsoft",
];

/** A provider's name as people know it, such as "GitHub". */
export function providerName(provider: SignInProvider): string {
  return (
    signInProviders.find((choice) => choice.id === provider)?.name ?? provider
  );
}

/**
 * The rows of the From {provider} card, in order: Name, Email, {provider} username, Avatar
 * and Account ID. Google and Microsoft accounts have no username row. The avatar is described
 * in words and never shown, because the image lives on the provider's origin.
 */
export function providerRows(
  provider: SignInProvider,
  details: ProviderDetails,
): ProviderRow[] {
  const name = providerName(provider);
  const rows: ProviderRow[] = [
    { label: "Name", value: details.name, mono: false },
    { label: "Email", value: details.email, mono: false },
  ];
  if (!providersWithoutUsernames.includes(provider)) {
    rows.push({
      label: `${name} username`,
      value: details.username,
      mono: true,
    });
  }
  rows.push(
    {
      label: "Avatar",
      value: details.avatarUrl === null ? null : `Your ${name} profile picture`,
      mono: false,
    },
    { label: "Account ID", value: details.providerAccountId, mono: true },
  );
  return rows;
}
