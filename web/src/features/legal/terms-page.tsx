import { LegalPage } from "./legal-page";

// The Terms of use. Publishers agree to these before they publish.
export function TermsPage() {
  return (
    <LegalPage title="Terms" updated="15 October 2026">
      <p>
        Durables is a free community registry of Temporal activities. It is run
        by David Dieruf as an individual, not by a company, and it is not
        affiliated with or endorsed by Temporal Technologies. By using Durables,
        you agree to these terms.
      </p>

      <h2>Using the site</h2>
      <p>
        Anyone can browse, search and copy from Durables without an account.
        Please don&apos;t disrupt the site: no automated traffic that degrades
        it for others, no attempts to get around its limits, and no attempts to
        reach data that isn&apos;t yours.
      </p>

      <h2>Publishing</h2>
      <p>To publish, you sign in and choose a handle. When you publish, you:</p>
      <ul>
        <li>
          confirm you wrote the code, or have the right to share it under these
          terms;
        </li>
        <li>keep ownership of it;</li>
        <li>
          let Durables store, analyse, display and distribute it, and let anyone
          view, copy and use it in their own projects, unless the code states a
          licence of its own.
        </li>
      </ul>
      <p>
        Handles and published versions are permanent. A handle can never be
        changed or given to someone else, and a published version can&apos;t be
        edited or replaced; you publish a new version instead. Check your code
        before you publish, and never include secrets, keys or anyone&apos;s
        personal data.
      </p>

      <h2>What you can&apos;t publish</h2>
      <ul>
        <li>Malicious code, or code that hides what it does.</li>
        <li>Code you don&apos;t have the right to share.</li>
        <li>Secrets, credentials or other people&apos;s personal data.</li>
        <li>Anything that impersonates another person or project.</li>
        <li>Anything unlawful.</li>
      </ul>
      <p>
        Durables may hide or remove content, or suspend an account, that breaks
        these terms, without notice.
      </p>

      <h2>Using published code</h2>
      <p>
        Activities on Durables are written by the community. Durables never runs
        published code. Its checks are automated, read the code as text, and can
        be wrong. Review any code before you use it; you are responsible for
        what you run.
      </p>

      <h2>No warranty</h2>
      <p>
        Durables and everything on it are provided as is, without warranties of
        any kind. To the extent the law allows, the operator is not liable for
        any loss or damage arising from your use of the site or of code found on
        it. The site may change, pause or close at any time.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change. The date at the top shows when they last did.
        Continuing to use Durables after a change means you accept it.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href="mailto:hello@durables.dev">hello@durables.dev</a>.
      </p>
    </LegalPage>
  );
}
