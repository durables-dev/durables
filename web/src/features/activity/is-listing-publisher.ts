import type { SessionUser } from "@/lib/session";

/**
 * Whether the visitor published this listing: signed in, with an account, whose handle is the
 * listing's. A visitor still being read is null, so they are not the publisher until the
 * session read answers.
 */
export function isListingPublisher(
  user: SessionUser | null,
  listingHandle: string,
): boolean {
  return user !== null && user.accountExists && user.handle === listingHandle;
}
