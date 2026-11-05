import { z } from "zod";
import type { BrowsePosition } from "../storage/storage";
import type { BrowseSort } from "./responses";

// The page position browse answers as nextCursor and reads back from the cursor parameter
// (api/CONVENTIONS.md: pagination is cursor-based). The client treats it as opaque. Inside, it
// is base64url JSON naming the sort it belongs to and the last card the previous batch showed.

/** A page position and the sort it belongs to. */
export interface BrowseCursor extends BrowsePosition {
  sort: BrowseSort;
}

const position = {
  publishedAt: z.int().nonnegative(),
  handle: z.string().min(1),
  name: z.string().min(1),
};

/** What a newest-first cursor holds: the last card's published second, handle and name. */
const newestCursor = z.strictObject({
  sort: z.literal("newest"),
  ...position,
});

/** What a relevance cursor holds: the newest-first fields and the last card's score. */
const relevanceCursor = z.strictObject({
  sort: z.literal("relevance"),
  score: z.int().nonnegative(),
  ...position,
});

const cursorJson = z.discriminatedUnion("sort", [
  newestCursor,
  relevanceCursor,
]);

const base64urlPattern = /^[A-Za-z0-9_-]+$/;

const toBase64url = (text: string): string =>
  btoa(String.fromCodePoint(...new TextEncoder().encode(text)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

/** The text a base64url string encodes, or undefined when it is not base64url UTF-8. */
const fromBase64url = (encoded: string): string | undefined => {
  if (!base64urlPattern.test(encoded)) {
    return undefined;
  }
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (c) => c.codePointAt(0) ?? 0);
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      bytes,
    );
  } catch {
    return undefined;
  }
};

/** The cursor for the batch after the one ending at this position, in this sort. */
export const encodeBrowseCursor = ({
  sort,
  score,
  publishedAt,
  handle,
  name,
}: BrowseCursor): string =>
  toBase64url(
    JSON.stringify({
      sort,
      // With no words every score is 0, so a newest-first cursor leaves it out.
      ...(sort === "relevance" ? { score } : {}),
      // published_at is stored in whole seconds.
      publishedAt: Math.floor(publishedAt.getTime() / 1000),
      handle,
      name,
    }),
  );

/** The position and sort a cursor names, or undefined when the cursor is malformed. */
export const decodeBrowseCursor = (
  cursor: string,
): BrowseCursor | undefined => {
  const text = fromBase64url(cursor);
  if (text === undefined) {
    return undefined;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = cursorJson.safeParse(json);
  if (!parsed.success) {
    return undefined;
  }
  const { sort, publishedAt, handle, name } = parsed.data;
  return {
    sort,
    score: parsed.data.sort === "relevance" ? parsed.data.score : 0,
    publishedAt: new Date(publishedAt * 1000),
    handle,
    name,
  };
};
