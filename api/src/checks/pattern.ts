/**
 * A detection pattern. Every pattern in the checks pipeline is one of these, because the
 * patterns are published as the rubric (ADR 0008). No ad hoc regex anywhere else.
 */
export interface Pattern {
  /** A stable name, such as `java-sdk-import`. Unique across the pipeline. */
  readonly name: string;
  /** What the pattern looks for, in plain words, as a publisher would read it. */
  readonly description: string;
  /** Never global or sticky, so testing it carries no state between calls. */
  readonly regex: RegExp;
}

/** Whether any of the patterns matches anywhere in the text. */
export const matchesAny = (patterns: readonly Pattern[], text: string) =>
  patterns.some((pattern) => pattern.regex.test(text));
