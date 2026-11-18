import { pageTitle, siteDescription } from "@/lib/page-title";

export interface PageTitleProps {
  /** The page's name. Leave it out on the home page. */
  page?: string;
  /** The page's search-result description. Leave it out to use the site's. */
  description?: string;
  /** Tells search engines not to index the page, such as an activity taken out of search. */
  noIndex?: boolean;
}

// Sets the browser tab title and the description search engines show. React 19 hoists
// <title> and <meta> into <head>, so a page renders this anywhere in its tree. index.html
// carries no description of its own, so each page has exactly one. index.html carries no robots
// marking either, so a page is indexed unless it says otherwise here.
export function PageTitle({ page, description, noIndex }: PageTitleProps) {
  return (
    <>
      <title>{pageTitle(page)}</title>
      <meta name="description" content={description ?? siteDescription} />
      {noIndex === true ? <meta name="robots" content="noindex" /> : null}
    </>
  );
}
