import { LegalPage } from "./legal-page";

// What Durables records about visitors and publishers (ADR 0007, ADR 0009).
export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      description="What Durables records when you visit or publish, how long it is kept, and your choices."
      updated="15 October 2026"
    >
      <p>
        Durables collects as little as it can. It is run by David Dieruf as an
        individual, has no income, shows no ads and sells nothing, including
        your data.
      </p>

      <h2>If you visit</h2>
      <p>You don&apos;t need an account to use Durables.</p>
      <ul>
        <li>
          The site is hosted on Cloudflare, which receives each request,
          including your IP address and browser details, in order to serve and
          protect the site.
        </li>
        <li>
          Durables uses Cloudflare Web Analytics, which counts page views and
          referring sites in aggregate. It sets no cookies and does not
          fingerprint your browser.
        </li>
        <li>
          The server keeps short-lived logs of requests to diagnose problems and
          stop abuse.
        </li>
      </ul>
      <p>
        No other third-party scripts, fonts or images are loaded on any page.
      </p>

      <h2>If you publish</h2>
      <p>
        You sign in with GitHub, GitLab, Google or Microsoft. Durables asks the
        provider for your identity only, and keeps:
      </p>
      <ul>
        <li>your name, email address and avatar;</li>
        <li>your account ID with that provider;</li>
        <li>the handle you choose, and the activities you publish.</li>
      </ul>
      <p>
        Durables does not ask for access to your repositories or anything else
        in your account. The provider&apos;s access token is used once, to sign
        you in, and is never stored. Durables then keeps a session of its own so
        you stay signed in.
      </p>
      <p>
        Your handle and what you publish are public. You are shown by handle and
        initials; your email address is never shown.
      </p>

      <h2>How long it&apos;s kept</h2>
      <p>
        Your identity details are kept while your account exists. Published
        versions are permanent, and a handle is never reissued, even after its
        account is deleted.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask to see the details Durables holds about you, to correct
        them, or to delete your account. Deleting it removes your identity
        details. Your handle stays retired, and your published versions may stay
        public.
      </p>

      <h2>Changes</h2>
      <p>
        If Durables starts collecting anything more, this page will say so
        first. The date at the top shows when it last changed.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions and requests:{" "}
        <a href="mailto:hello@durables.dev">hello@durables.dev</a>.
      </p>
    </LegalPage>
  );
}
