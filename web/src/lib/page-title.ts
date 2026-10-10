const site = "Durables";

/** The browser tab title for a page: "Durables" for home, "<Page> · Durables" otherwise. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${site}` : site;
}
