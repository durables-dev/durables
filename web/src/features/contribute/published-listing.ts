import { z } from "zod";

// What the Published screen shows, carried in the history entry's state. The draft is cleared
// on publish, so the history entry is what keeps the screen across a reload.

const publishedListingSchema = z.object({
  handle: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  /** True when this publish created the publisher's Durables account. */
  accountCreated: z.boolean(),
});

export type PublishedListing = z.infer<typeof publishedListingSchema>;

/** The address of the Published screen. It is not a step, so the step list leaves it out. */
export const publishedPath = "/contribute/published";

/** The step named in the address of the Published screen. */
export const publishedParam = "published";

/** The listing a history entry's state says was published, or undefined when it says none. */
export function readPublishedListing(
  state: unknown,
): PublishedListing | undefined {
  const parsed = z
    .object({ published: publishedListingSchema })
    .safeParse(state);
  return parsed.success ? parsed.data.published : undefined;
}

/** The history entry state that opens the Published screen for a listing. */
export function publishedState(listing: PublishedListing): {
  published: PublishedListing;
} {
  return { published: listing };
}

/** The address as the site shows it: `handle/name@version`. */
export function publishedAddress({
  handle,
  name,
  version,
}: PublishedListing): string {
  return `${handle}/${name}@${version}`;
}
