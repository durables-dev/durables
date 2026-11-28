import { findChip } from "@durables/schemas";
import { Link } from "react-router";
import { searchAddress, type Search } from "@/lib/search-address";
import styles from "./integration-link.module.css";

export interface IntegrationLinkProps {
  /** The chip to link to: an integration or a workflow pattern. */
  integration: string;
  /**
   * The search the page is showing, when the link sits on the results page. The link then
   * keeps its words, SDKs and category, and makes this chip the only one chosen. Without it,
   * the link opens results for this chip alone.
   */
  search?: Search;
}

/**
 * The search a chip link opens. From the results page it keeps the words, the SDKs and any
 * category in the address, replaces the chosen chips with this one, and drops the publisher.
 * From anywhere else it is this chip alone.
 */
function chipSearch(chip: Search["chips"][number], search?: Search) {
  if (search === undefined) {
    return { chips: [chip] };
  }
  return {
    words: search.words,
    sdks: search.sdks,
    chips: [chip],
    ...(search.category === undefined ? {} : { category: search.category }),
  };
}

// A chip on the shared list, integration or pattern, links to results for it. One the list
// does not know could not be searched for, so it shows as plain text.
export function IntegrationLink({ integration, search }: IntegrationLinkProps) {
  const chip = findChip(integration);
  if (chip === undefined) {
    return <span>{integration}</span>;
  }
  return (
    <Link
      to={searchAddress(chipSearch(chip, search))}
      className={styles["integration"]}
    >
      {integration}
    </Link>
  );
}
