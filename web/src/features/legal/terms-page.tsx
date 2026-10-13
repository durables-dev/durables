import { LegalPage } from "./legal-page";
import { PlaceholderNotice } from "./placeholder-notice";

// Placeholder until the operator supplies the Terms. The real text replaces the notice and
// the paragraphs below.
export function TermsPage() {
  return (
    <LegalPage title="Terms">
      <PlaceholderNotice />
      <p>
        This page will hold the Terms for using Durables and for publishing
        activities to it.
      </p>
      <p>
        Publishers will be asked to agree to these Terms before they publish.
      </p>
    </LegalPage>
  );
}
