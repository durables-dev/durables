// Written from the POC-11 API map, boundary 1 (POST /activities/version-suggestion).

export type Bump = "major" | "minor" | "patch";

export type VersionReasonKind =
  | "activity-name"
  | "parameters"
  | "input-fields"
  | "output-type"
  | "non-retryable-errors"
  | "env-vars"
  | "unchanged";

export type VersionReason = {
  bump: Bump;
  kind: VersionReasonKind;
  /** Shown as-is. */
  message: string;
  /** In the pasted code, where the changed thing is declared. */
  line?: number;
};

export type VersionSuggestion = {
  /** The derived listing name: "charge-card". */
  name: string;
  /** The highest published version of that name, owned by the signed-in user. Null on a first publish. */
  previousVersion: string | null;
  /** "2.0.0". "1.0.0" when previousVersion is null. */
  suggestedVersion: string;
  bump: "first" | Bump;
  /** Empty when bump is "first". At least one otherwise. */
  reasons: VersionReason[];
};
