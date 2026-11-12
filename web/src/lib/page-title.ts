const site = "Durables";

/** The search-result description for a page that has none of its own, such as the home page. */
export const siteDescription =
  "A free community registry of Temporal activities. Find an activity, copy it into your worker, or publish your own.";

/** The browser tab title for a page: "Durables" for home, "<Page> · Durables" otherwise. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${site}` : site;
}
