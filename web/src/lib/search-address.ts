import {
  handleFormatSchema,
  integrations,
  sdks,
  type Integration,
  type Sdk,
} from "@durables/schemas";
import { z } from "zod";

/** The path of the results page. "search" is on the reserved-handle list. */
export const searchPath = "/search";

/** What a results page shows: the words typed, the chosen filters, and a publisher. */
export interface Search {
  /** The words typed, exactly as typed. Empty means no words. */
  words: string;
  /** The chosen SDKs, in the order chosen. Empty means any SDK. */
  sdks: readonly Sdk[];
  /** The chosen integrations, in the order chosen. Empty means any integration. */
  integrations: readonly Integration[];
  /** The publisher's handle, when the results are one publisher's activities. */
  publisher?: string;
}

/** The parameter names in a /search address, such as /search?q=charge&sdk=Python. */
const param = {
  words: "q",
  sdk: "sdk",
  integration: "integration",
  publisher: "publisher",
} as const;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** A repeated parameter's values, keeping those on the shared list and dropping the rest. */
function knownValues<T extends string>(known: readonly T[]) {
  const isKnown = (value: string): value is T =>
    known.some((entry) => entry === value);
  return z
    .array(z.string())
    .transform((values) => unique(values.filter(isKnown)));
}

const searchParamsSchema = z.object({
  words: z
    .string()
    .nullable()
    .transform((words) => words ?? ""),
  sdks: knownValues(sdks),
  integrations: knownValues(integrations),
  publisher: z
    .string()
    .nullable()
    .transform((publisher) =>
      publisher !== null && handleFormatSchema.safeParse(publisher).success
        ? publisher
        : undefined,
    ),
});

/**
 * The /search address for a search: /search?q=…&sdk=…&integration=…&publisher=…. A part
 * that is empty or left out is not written, so an empty search is plain /search. Home,
 * result cards and the activity page all build their links with this.
 */
export function searchAddress(search: Partial<Search> = {}): string {
  const params = new URLSearchParams();
  if (search.words !== undefined && search.words !== "") {
    params.set(param.words, search.words);
  }
  for (const sdk of unique(search.sdks ?? [])) {
    params.append(param.sdk, sdk);
  }
  for (const integration of unique(search.integrations ?? [])) {
    params.append(param.integration, integration);
  }
  if (search.publisher !== undefined && search.publisher !== "") {
    params.set(param.publisher, search.publisher);
  }
  const query = params.toString();
  return query === "" ? searchPath : `${searchPath}?${query}`;
}

/**
 * The search a /search address holds, read from its search params. No parameters means no
 * words and no filters. SDKs and integrations not on the shared lists are dropped, as is a
 * publisher that cannot be a handle. Repeated values count once.
 */
export function readSearch(params: URLSearchParams): Search {
  const { publisher, ...search } = searchParamsSchema.parse({
    words: params.get(param.words),
    sdks: params.getAll(param.sdk),
    integrations: params.getAll(param.integration),
    publisher: params.get(param.publisher),
  });
  return publisher === undefined ? search : { ...search, publisher };
}
