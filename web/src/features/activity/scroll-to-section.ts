import type { MouseEvent } from "react";
import type { ListingSectionId } from "./listing-sections";

/**
 * Scrolls the page so the section is at the top of the view, under the section bar. Used as
 * a link's click handler: the router keeps the address unchanged, and the section's
 * scroll-margin keeps the stuck bar from covering it.
 */
export function scrollToSection(
  id: ListingSectionId,
  event: MouseEvent<HTMLAnchorElement>,
): void {
  const section = document.getElementById(id);
  if (section === null) return;
  event.preventDefault();
  section.scrollIntoView({ block: "start" });
}
