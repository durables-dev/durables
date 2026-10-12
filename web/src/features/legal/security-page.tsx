import { LegalPage } from "./legal-page";
import { PlaceholderNotice } from "./placeholder-notice";

// Placeholder until the operator supplies the Security text. The real text replaces the
// notice and the paragraphs below.
export function SecurityPage() {
  return (
    <LegalPage title="Security">
      <PlaceholderNotice />
      <p>
        This page will describe how Durables protects the site and the
        activities published to it.
      </p>
      <p>The operator will publish the final text here.</p>
    </LegalPage>
  );
}
