/** The brand colours a result card's icon tile is drawn in. */
export const tileColours = ["tangerine", "gold", "ember", "lagoon"] as const;

export type TileColour = (typeof tileColours)[number];

/**
 * The colour of a result card's icon tile, picked from the brand colours by the activity's
 * title and its publisher's handle. The same title and handle always get the same colour.
 */
export function tileColour(title: string, handle: string): TileColour {
  let hash = 0;
  for (const character of `${title}\n${handle}`) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return tileColours[hash % tileColours.length] ?? "tangerine";
}
