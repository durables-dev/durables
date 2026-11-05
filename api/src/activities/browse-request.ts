import { sdkSchema } from "@durables/schemas";
import { z } from "zod";
import { decodeBrowseCursor } from "./browse-cursor";

// The browse request: GET /api/activities with filters and a page position in the query. The
// validator answers 400 Problem Details when a value is not acceptable.

/** The most cards one browse batch holds. */
export const BROWSE_BATCH_SIZE = 50;

export const sdkFilterMessage = "Choose Python, TypeScript or .NET.";

export const cursorMessage = "The page position is not valid.";

export const publisherMessage = "Enter a publisher handle.";

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
 * The browse query. Several SDKs match any one of them, as do several integrations. The
 * publisher matches the handle exactly. The cursor is the nextCursor of the previous batch.
 */
export const browseQuery = z.object({
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
});

export type BrowseQuery = z.output<typeof browseQuery>;
