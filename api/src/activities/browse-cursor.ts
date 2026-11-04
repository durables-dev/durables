import { z } from "zod";
import type { BrowsePosition } from "../storage/storage";

// The page position browse answers as nextCursor and reads back from the cursor parameter
// (api/CONVENTIONS.md: pagination is cursor-based). The client treats it as opaque. Inside, it
// is base64url JSON naming the sort it belongs to and the last card the previous batch showed.

/** What a newest-first cursor holds: the last card's published second, handle and name. */
const newestCursor = z.strictObject({
  sort: z.literal("newest"),
  publishedAt: z.int().nonnegative(),
  handle: z.string().min(1),
  name: z.string().min(1),
});

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

/** The cursor for the batch after the one ending at this position. */
export const encodeBrowseCursor = ({
  publishedAt,
  handle,
  name,
}: BrowsePosition): string =>
  toBase64url(
    JSON.stringify({
      sort: "newest",
      // published_at is stored in whole seconds.
      publishedAt: Math.floor(publishedAt.getTime() / 1000),
      handle,
      name,
    }),
  );

/** The position a cursor names, or undefined when the cursor is malformed. */
export const decodeBrowseCursor = (
  cursor: string,
): BrowsePosition | undefined => {
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
  const parsed = newestCursor.safeParse(json);
  if (!parsed.success) {
    return undefined;
  }
  const { publishedAt, handle, name } = parsed.data;
  return { publishedAt: new Date(publishedAt * 1000), handle, name };
};
