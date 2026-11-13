import type { Tier } from "./facts";
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
  /**
   * Patterns that recognise an activity in this SDK's language by the function's shape alone,
   * with no Temporal marker. They are tried only when no SDK's markers match, and an SDK
   * recognised by one is inferred. Empty when the SDK is only ever recognised by its markers.
   */
  readonly shapeMarkers: readonly Pattern[];
}

/** An SDK identification can recognise. */
export interface Recognisable<S extends string> {
  readonly sdk: S;
  readonly recognition: SdkRecognition;
}

/**
 * How an identified SDK was established: `detected` by its Temporal markers, or `inferred`
 * from the function's shape with no Temporal marker.
 */
export type IdentificationTier = Extract<Tier, "detected" | "inferred">;

/** One SDK was identified. */
export interface Identified<S extends string> {
  readonly outcome: "identified";
  readonly sdk: S;
  readonly tier: IdentificationTier;
  /**
   * The names of the SDK's recognition patterns that matched, each once, in the order the SDK
   * lists them. For a detected SDK these are its SDK markers, then its activity markers. For
   * an inferred SDK they are its shape markers.
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
  sdk: S,
  tier: IdentificationTier,
  patterns: readonly Pattern[],
  text: string,
): Identified<S> => {
  const matched = patterns
    .filter((pattern) => pattern.regex.test(text))
    .map(({ name }) => name);
  return {
    outcome: "identified",
    sdk,
    tier,
    matchedPatterns: [...new Set(matched)],
  };
};

const ambiguous = <S extends string>(
  tied: readonly Recognisable<S>[],
): Ambiguous<S> => ({
  outcome: "ambiguous",
  sdks: tied.map(({ sdk }) => sdk).sort(byName),
});

/**
 * Infers the SDK from the function's shape, when no SDK's markers matched. One SDK whose shape
 * markers match is inferred. Several are ambiguous. None is not identified.
 */
const inferSdk = <S extends string>(
  text: string,
  candidates: readonly Recognisable<S>[],
): Identification<S> => {
  const shaped = candidates.filter(({ recognition }) =>
    matchesAny(recognition.shapeMarkers, text),
  );
  const [only, ...rest] = shaped;
  if (only === undefined) {
    return { outcome: "not-identified" };
  }
  if (rest.length > 0) {
    return ambiguous(shaped);
  }
  return identified(only.sdk, "inferred", only.recognition.shapeMarkers, text);
};

/**
 * Identifies the SDK of the text. An SDK matches when one of its SDK markers does. One
 * matching SDK is that SDK, detected. Among several, the one SDK whose activity markers also
 * match is chosen. Otherwise nothing decides between them, and the text is ambiguous. When no
 * SDK marker matches at all, the SDK is inferred from the shape markers instead.
 */
export const identifySdk = <S extends string>(
  text: string,
  candidates: readonly Recognisable<S>[],
): Identification<S> => {
  const marked = candidates.filter(({ recognition }) =>
    matchesAny(recognition.sdkMarkers, text),
  );
  if (marked.length === 0) {
    return inferSdk(text, candidates);
  }
  const deciding =
    marked.length === 1
      ? marked
      : marked.filter(({ recognition }) =>
          matchesAny(recognition.activityMarkers, text),
        );
  const [only, ...rest] = deciding;
  if (only !== undefined && rest.length === 0) {
    const { sdkMarkers, activityMarkers } = only.recognition;
    return identified(
      only.sdk,
      "detected",
      [...sdkMarkers, ...activityMarkers],
      text,
    );
  }
  return ambiguous(deciding.length > 1 ? deciding : marked);
};
