import { matchesAny, type Pattern } from "./pattern";

// Identification: which SDK pasted code is written in. One function runs over every SDK the
// pipeline knows, and its answer never depends on the order the SDKs are listed in.

/** The patterns that recognise one Temporal SDK in pasted code. */
export interface SdkRecognition {
  /** Patterns that show the file uses this SDK. Any one matching is enough. */
  readonly sdkMarkers: readonly Pattern[];
  /**
   * Patterns that show the file declares an activity in this SDK. They decide between SDKs
   * when a file has markers for more than one.
   */
  readonly activityMarkers: readonly Pattern[];
}

/** An SDK identification can recognise. */
export interface Recognisable<S extends string> {
  readonly sdk: S;
  readonly recognition: SdkRecognition;
}

/**
 * How an identified SDK was established. Every SDK is recognised by its markers today, so it
 * is always detected. The inferred tier arrives with fact provenance.
 */
export type IdentificationTier = "detected";

/** One SDK was identified. */
export interface Identified<S extends string> {
  readonly outcome: "identified";
  readonly sdk: S;
  readonly tier: IdentificationTier;
  /**
   * The names of the SDK's recognition patterns that matched, SDK markers first, each once,
   * in the order the SDK lists them.
   */
  readonly matchedPatterns: readonly string[];
}

/** Several SDKs matched and nothing decided between them. */
export interface Ambiguous<S extends string> {
  readonly outcome: "ambiguous";
  /** The SDKs that could not be told apart, sorted by name. */
  readonly sdks: readonly S[];
}

/** No SDK matched. */
export interface NotIdentified {
  readonly outcome: "not-identified";
}

export type Identification<S extends string> =
  Identified<S> | Ambiguous<S> | NotIdentified;

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const identified = <S extends string>(
  { sdk, recognition }: Recognisable<S>,
  text: string,
): Identified<S> => {
  const matched = [...recognition.sdkMarkers, ...recognition.activityMarkers]
    .filter((pattern) => pattern.regex.test(text))
    .map(({ name }) => name);
  return {
    outcome: "identified",
    sdk,
    tier: "detected",
    matchedPatterns: [...new Set(matched)],
  };
};

/**
 * Identifies the SDK of the text. An SDK matches when one of its SDK markers does. One
 * matching SDK is that SDK. Among several, the one SDK whose activity markers also match is
 * chosen. Otherwise nothing decides between them, and the text is ambiguous. No match at all
 * is not identified.
 */
export const identifySdk = <S extends string>(
  text: string,
  candidates: readonly Recognisable<S>[],
): Identification<S> => {
  const marked = candidates.filter(({ recognition }) =>
    matchesAny(recognition.sdkMarkers, text),
  );
  if (marked.length === 0) {
    return { outcome: "not-identified" };
  }
  const deciding =
    marked.length === 1
      ? marked
      : marked.filter(({ recognition }) =>
          matchesAny(recognition.activityMarkers, text),
        );
  const [only, ...rest] = deciding;
  if (only !== undefined && rest.length === 0) {
    return identified(only, text);
  }
  const tied = deciding.length > 1 ? deciding : marked;
  return {
    outcome: "ambiguous",
    sdks: tied.map(({ sdk }) => sdk).sort(byName),
  };
};
