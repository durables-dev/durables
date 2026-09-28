import { useParams } from "react-router";
import { Panel } from "../components/Panel";
import { GroupFile } from "../features/listing/GroupFile";
import { GroupListingHeader } from "../features/listing/GroupListingHeader";
import { GroupMembers } from "../features/listing/GroupMembers";
import { useGroupListing } from "../features/listing/useGroupListing";
import { parseAddress } from "../lib/address";
import styles from "./ListingPage.module.css";

/** Step 7: the group listing at /<owner>/groups/<name>@<version>, or the default version at /<owner>/groups/<name>. */
export function GroupListingPage() {
  const params = useParams<{ owner: string; nameAtVersion: string }>();
  const owner = params.owner ?? "";
  const { name, version } = parseAddress(params.nameAtVersion ?? "");
  const { listing, error } = useGroupListing(owner, name, version);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!listing) return <p>Loading…</p>;

  return (
    <>
      <GroupListingHeader listing={listing} />
      <div className={styles.columns}>
        <Panel title="Group file">
          <GroupFile listing={listing} />
        </Panel>
        <aside>
          <Panel title="Members">
            <GroupMembers members={listing.members} />
          </Panel>
        </aside>
      </div>
    </>
  );
}
