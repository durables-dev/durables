import { pageTitle } from "@/lib/page-title";

export interface PageTitleProps {
  /** The page's name. Leave it out on the home page. */
  page?: string;
}

// Sets the browser tab title. React 19 hoists <title> into <head>, ahead of the fallback
// title in index.html, so a page renders this anywhere in its tree.
export function PageTitle({ page }: PageTitleProps) {
  return <title>{pageTitle(page)}</title>;
}
