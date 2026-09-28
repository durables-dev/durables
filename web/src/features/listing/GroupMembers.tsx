import { Link } from "react-router";
import type { GroupListing } from "../../api/types";
import { listingPath } from "../../lib/address";
import styles from "./GroupMembers.module.css";

/** The group's members, pinned, each linking to the listing of the version it pins. */
export function GroupMembers({ members }: { members: GroupListing["members"] }) {
  return (
    <ul className={styles.list}>
      {members.map((member) => (
        <li key={member.address} className={styles.item}>
          <Link to={listingPath(member.owner, member.name, member.version)}>
            {member.name}@{member.version}
          </Link>
          <code className={styles.address}>{member.address}</code>
        </li>
      ))}
    </ul>
  );
}
