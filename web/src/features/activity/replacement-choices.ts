// The Deprecate dialog's "Point people to" choices: No replacement, then every other version
// of the listing, newest first, the latest marked "(latest)". The dialog starts on the latest
// other version, or on No replacement when there is no other version.

/** The value No replacement is sent as before it becomes null. */
export const noReplacement = "";

export interface ReplacementChoice {
  /** The version number, or noReplacement. */
  value: string;
  label: string;
}

/**
 * The choices for deprecating `current`, from the listing's versions, newest first, so the
 * first is the latest.
 */
export function replacementChoices(
  versions: readonly string[],
  current: string,
): ReplacementChoice[] {
  const [latest] = versions;
  return [
    { value: noReplacement, label: "No replacement" },
    ...versions
      .filter((version) => version !== current)
      .map((version) => ({
        value: version,
        label: version === latest ? `${version} (latest)` : version,
      })),
  ];
}

/** The choice the dialog starts on: the newest version that is not `current`. */
export function defaultReplacement(
  versions: readonly string[],
  current: string,
): string {
  return versions.find((version) => version !== current) ?? noReplacement;
}
