import {
  findCategory,
  findChip,
  handleFormatSchema,
  type CategoryName,
  type Chip,
} from "@durables/schemas";
import { z } from "zod";
import type { SdkName } from "./sdk-catalog";

/** The path of the results page. "search" is on the reserved-handle list. */
export const searchPath = "/search";

/** What a results page shows: the words typed, the chosen filters, a category and a publisher. */
export interface Search {
  /** The words typed, exactly as typed. Empty means no words. */
  words: string;
  /** The chosen SDKs, named as the SDK catalog names them, in the order chosen. Empty means any SDK. */
  sdks: readonly SdkName[];
  /** The chosen chips, integrations and patterns, in the order chosen. Empty means any chip. */
  chips: readonly Chip[];
  /**
   * The category a home page tile chose. It turns no chip on. It stays while chips are on, and
   * the api applies it only while none is.
   */
  category?: CategoryName;
  /** The publisher's handle, when the results are one publisher's activities. */
  publisher?: string;
}

/** The parameter names in a /search address, such as /search?q=charge&sdk=Python&chip=Stripe. */
const param = {
  words: "q",
  sdk: "sdk",
  chip: "chip",
  category: "category",
  publisher: "publisher",
} as const;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Folds a name for comparison, so names that differ only by case or surrounding whitespace match. */
const fold = (name: string) => name.trim().toLowerCase();

/** The SDK in `sdks` whose name matches `name` ignoring case. Undefined when none does. */
const findSdk = (sdks: readonly SdkName[]) => (name: string) =>
  sdks.find((sdk) => fold(sdk) === fold(name));

/**
 * A repeated parameter's values, each read as the known name it matches ignoring case. Values
 * that match no known name are dropped, and a name repeated counts once.
 */
function knownValues<T extends string>(find: (name: string) => T | undefined) {
  return z.array(z.string()).transform((values) =>
    unique(
      values.flatMap((value) => {
        const known = find(value);
        return known === undefined ? [] : [known];
      }),
    ),
  );
}

/** The address's search params, keeping only the SDKs in `sdks`. */
const searchParamsSchema = (sdks: readonly SdkName[]) =>
  z.object({
    words: z
      .string()
      .nullable()
      .transform((words) => words ?? ""),
    sdks: knownValues(findSdk(sdks)),
    chips: knownValues(findChip),
    category: z
      .string()
      .nullable()
      .transform((name): CategoryName | undefined =>
        name === null ? undefined : findCategory(name)?.name,
      ),
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
 * The /search address for a search: /search?q=…&sdk=…&chip=…&category=…&publisher=…. SDKs and
 * chips repeat their parameter. A part that is empty or left out is not written, so an empty
 * search is plain /search. Home, result cards and the activity page all build their links with
 * this.
 */
export function searchAddress(search: Partial<Search> = {}): string {
  const params = new URLSearchParams();
  if (search.words !== undefined && search.words !== "") {
    params.set(param.words, search.words);
  }
  for (const sdk of unique(search.sdks ?? [])) {
    params.append(param.sdk, sdk);
  }
  for (const chip of unique(search.chips ?? [])) {
    params.append(param.chip, chip);
  }
  if (search.category !== undefined) {
    params.set(param.category, search.category);
  }
  if (search.publisher !== undefined && search.publisher !== "") {
    params.set(param.publisher, search.publisher);
  }
  const query = params.toString();
  return query === "" ? searchPath : `${searchPath}?${query}`;
}

/**
 * The search a /search address holds, read from its search params. No parameters means no
 * words and no filters. SDK, chip and category names are matched ignoring case and read as the
 * site names them. An SDK is kept only when `sdks`, the SDK catalog's names, lists it. Chips and
 * a category not on the shared list are dropped, as is a publisher that cannot be a handle.
 * Repeated values count once. Only the first category counts. The old `integration` parameter
 * is not read.
 */
export function readSearch(
  params: URLSearchParams,
  sdks: readonly SdkName[],
): Search {
  const { category, publisher, ...search } = searchParamsSchema(sdks).parse({
    words: params.get(param.words),
    sdks: params.getAll(param.sdk),
    chips: params.getAll(param.chip),
    category: params.get(param.category),
    publisher: params.get(param.publisher),
  });
  return {
    ...search,
    ...(category === undefined ? {} : { category }),
    ...(publisher === undefined ? {} : { publisher }),
  };
}
