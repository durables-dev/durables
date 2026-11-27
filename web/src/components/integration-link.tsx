import { integrationSchema } from "@durables/schemas";
import { Link } from "react-router";
import { searchAddress } from "@/lib/search-address";
import styles from "./integration-link.module.css";

export interface IntegrationLinkProps {
  integration: string;
}

// An integration on the shared list links to results for it alone. One the list does not
// know could not be searched for, so it shows as plain text.
export function IntegrationLink({ integration }: IntegrationLinkProps) {
  const known = integrationSchema.safeParse(integration);
  if (!known.success) {
    return <span>{integration}</span>;
  }
  return (
    <Link
      to={searchAddress({ chips: [known.data] })}
      className={styles["integration"]}
    >
      {integration}
    </Link>
  );
}
