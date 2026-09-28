import { useParams } from "react-router";
import { Panel } from "../components/Panel";
import { DetectionPanel } from "../features/detection-panel/DetectionPanel";
import { CheckResults } from "../features/evaluation-report/CheckResults";
import { ConfigurationSection } from "../features/listing/ConfigurationSection";
import { ListingHeader } from "../features/listing/ListingHeader";
import { ListingReadme } from "../features/listing/ListingReadme";
import { useListing } from "../features/listing/useListing";
import { SnippetTabs } from "../features/snippet-tabs/SnippetTabs";
import { parseAddress } from "../lib/address";
import { SDK_LANGUAGES } from "../lib/sdks";
import styles from "./ListingPage.module.css";

/**
 * Steps 5 and 9: the activity listing at /<owner>/<name>@<version>, or the
 * default version at /<owner>/<name>, in any SDK.
 */
export function ListingPage() {
  const params = useParams<{ owner: string; nameAtVersion: string }>();
  const owner = params.owner ?? "";
  const { name, version } = parseAddress(params.nameAtVersion ?? "");
  const { listing, error } = useListing(owner, name, version);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!listing) return <p>Loading…</p>;
  const language = SDK_LANGUAGES[listing.sdk];

  return (
    <>
      <ListingHeader listing={listing} />
      <section className={styles.snippets}>
        <SnippetTabs snippets={listing.snippets} />
      </section>
      <div className={styles.columns}>
        <Panel title="README">
          <ListingReadme readme={listing.readme} />
        </Panel>
        <aside>
          <Panel title="Detected">
            <DetectionPanel detection={listing.detection} evidence={{ code: listing.code, language }} compact />
          </Panel>
          <Panel title="Configuration">
            <ConfigurationSection configuration={listing.configuration} />
          </Panel>
        </aside>
      </div>
      <Panel title="Evaluation report">
        <CheckResults code={listing.code} checks={listing.checks} language={language} />
      </Panel>
    </>
  );
}
