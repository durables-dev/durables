import { LegalPage } from "./legal-page";
import { PlaceholderNotice } from "./placeholder-notice";

// Placeholder until the operator supplies the Privacy text. The real text replaces the
// notice and the paragraphs below.
export function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <PlaceholderNotice />
      <p>
        This page will describe what Durables records about visitors and
        publishers, and what it does with that information.
      </p>
      <p>The operator will publish the final text here.</p>
    </LegalPage>
  );
}
