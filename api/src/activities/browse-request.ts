import { z } from "zod";
import { sdkSchema, sdks } from "../sdks/sdk-list";
import { decodeBrowseCursor } from "./browse-cursor";
import type { BrowseSort } from "./responses";

// The browse request: GET /api/activities with search words, filters and a page position in the
// query. The validator answers 400 Problem Details when a value is not acceptable.

/** The most cards one browse batch holds. */
export const BROWSE_BATCH_SIZE = 50;

/** "Choose Java, Python, TypeScript or .NET.": every SDK in the api's list, in its order. */
export const sdkFilterMessage = `Choose ${sdks.slice(0, -1).join(", ")} or ${sdks.at(-1) ?? ""}.`;

export const cursorMessage = "The page position is not valid.";

export const publisherMessage = "Enter a publisher handle.";

/** The most characters the search words can hold. */
export const MAX_WORDS_LENGTH = 500;

export const wordsMessage = `Enter up to ${MAX_WORDS_LENGTH} characters to search for.`;

/** The words in what was typed. Spaces separate them, and spaces alone are no words. */
export const searchWords = (typed: string): string[] =>
  typed.split(/\s+/).filter((word) => word !== "");

/** Relevance when there are words, newest first otherwise. */
export const browseSort = (words: readonly string[]): BrowseSort =>
  words.length > 0 ? "relevance" : "newest";

/**
 * A query parameter that may be sent once or repeated. Hono's validator hands over a string
 * for one value and an array for several; either way the parsed value is an array.
 */
const repeatable = <T extends z.ZodType<string>>(item: T, error?: string) =>
  z
    .union([z.array(item), item], error === undefined ? undefined : { error })
    .transform((value): z.output<T>[] =>
      Array.isArray(value) ? value : [value],
    )
    .optional();

/**
 * The browse query. The words in q must all match. Several SDKs match any one of them, as do
 * several integrations. The publisher matches the handle exactly. The cursor is the nextCursor
 * of the previous batch, and must belong to the sort the words call for.
 */
export const browseQuery = z
  .object({
    q: z
      .string({ error: wordsMessage })
      .max(MAX_WORDS_LENGTH, { error: wordsMessage })
      .transform(searchWords)
      .optional(),
    sdk: repeatable(sdkSchema, sdkFilterMessage),
    integration: repeatable(z.string()),
    publisher: z.string().min(1, { error: publisherMessage }).optional(),
    cursor: z
      .string()
      .transform((cursor, ctx) => {
        const position = decodeBrowseCursor(cursor);
        if (position === undefined) {
          ctx.addIssue({ code: "custom", message: cursorMessage });
          return z.NEVER;
        }
        return position;
      })
      .optional(),
  })
  .superRefine(({ q = [], cursor }, ctx) => {
    if (cursor !== undefined && cursor.sort !== browseSort(q)) {
      ctx.addIssue({
        code: "custom",
        path: ["cursor"],
        message: cursorMessage,
      });
    }
  });

export type BrowseQuery = z.output<typeof browseQuery>;
