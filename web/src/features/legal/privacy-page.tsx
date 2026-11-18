import { LegalPage } from "./legal-page";

// What Durables records about visitors and publishers (ADR 0007, ADR 0009).
export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      description="What Durables records when you visit or publish, how long it is kept, and your choices."
      updated="17 November 2026"
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
        provider for your identity only, and stores:
      </p>
      <ul>
        <li>which provider you sign in with, and your account ID with it;</li>
        <li>the handle you choose, and the activities you publish.</li>
      </ul>
      <p>
        Your name, email address and avatar come from the provider each time you
        sign in. They live only in your sign-in session and are never stored by
        Durables.
      </p>
      <p>
        Durables does not ask for access to your repositories or anything else
        in your account. The provider&apos;s access token is used once, to sign
        you in, and is never stored. Durables then keeps a session of its own so
        you stay signed in.
      </p>
      <p>
        Your handle and what you publish are public. You are shown by handle and
        initials; your email address is never shown to anyone but you.
      </p>

      <h2>How long it&apos;s kept</h2>
      <p>
        Your provider account ID is kept while your account exists. Your name,
        email address and avatar live only in your sign-in session, so they go
        when the session ends.
      </p>
      <p>
        A deleted account can be restored by signing in within 30 days. Your
        provider account ID is kept until then, and deleted afterward.
      </p>
      <p>
        Published versions are permanent, and a handle is never reissued, even
        after its account is deleted.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask to see the details Durables holds about you, to correct
        them, or to delete your account.
      </p>
      <p>
        Deleting your account ends your sign-in session, which removes your
        name, email address and avatar at once. Your activities leave search,
        and their pages and addresses keep working.
      </p>
      <p>
        You can restore a deleted account by signing in with the same provider
        account within 30 days. After that, your provider account ID is deleted
        and your handle is retired for good. Your published versions may stay
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
