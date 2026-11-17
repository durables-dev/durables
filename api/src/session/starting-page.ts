// The page a sign-in started from, which a finished sign-in for an existing account returns
// to. Only a path on this site is ever kept or followed, so the start route can never be used
// to send someone to another site.

/** The start route's query parameter that names the starting page. */
export const startingPageParam = "returnTo";

/** The longest starting page kept. A longer one is ignored, which keeps the cookie small. */
export const startingPageMaxLength = 2048;

/** A stand-in origin to resolve the path against. Any other origin after resolving is refused. */
const siteOrigin = "https://durables.invalid";

/**
 * The starting page as a same-site path, or undefined when there is none or it is not one.
 * Absolute URLs, protocol-relative URLs and anything a browser would read as another host are
 * refused. The path comes back normalized, as the browser would request it.
 */
export const sameSitePath = (value: string | undefined): string | undefined => {
  if (
    value === undefined ||
    value.length > startingPageMaxLength ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value, siteOrigin);
  } catch {
    return undefined;
  }
  if (url.origin !== siteOrigin) {
    return undefined;
  }
  return `${url.pathname}${url.search}${url.hash}`;
};
