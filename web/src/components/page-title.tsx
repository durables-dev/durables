import { pageTitle, siteDescription } from "@/lib/page-title";

export interface PageTitleProps {
  /** The page's name. Leave it out on the home page. */
  page?: string;
  /** The page's search-result description. Leave it out to use the site's. */
  description?: string;
}

// Sets the browser tab title and the description search engines show. React 19 hoists
// <title> and <meta> into <head>, so a page renders this anywhere in its tree. index.html
// carries no description of its own, so each page has exactly one.
export function PageTitle({ page, description }: PageTitleProps) {
  return (
    <>
      <title>{pageTitle(page)}</title>
      <meta name="description" content={description ?? siteDescription} />
    </>
  );
}
