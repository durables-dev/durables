/** The page's sections, in the order the section bar lists them. Each id is its anchor. */
export const listingSections = [
  { id: "implement", label: "Implement" },
  { id: "configure", label: "Configure" },
  { id: "source", label: "Source" },
] as const;

export type ListingSectionId = (typeof listingSections)[number]["id"];

/** The anchor's href, such as "#implement", so the link works before the page's script runs. */
export const sectionHref = (id: ListingSectionId) => `#${id}`;
