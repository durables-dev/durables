import { LegalPage } from "./legal-page";

// How Durables protects the site and its publishers, and how to report a problem.
export function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      description="How Durables protects you, what to check before using published code, and how to report a problem."
      updated="15 October 2026"
    >
      <p>
        Durables is built to hold as little as possible that could be misused,
        and to keep what it does hold safe.
      </p>

      <h2>How Durables protects you</h2>
      <ul>
        <li>
          There are no passwords. You sign in with GitHub, GitLab, Google or
          Microsoft.
        </li>
        <li>
          Sign-in asks for your identity only, and the provider&apos;s access
          token is never stored.
        </li>
        <li>
          Every page carries a strict content security policy: scripts and
          requests may come only from Durables itself and its Cloudflare
          analytics.
        </li>
        <li>
          Published versions can&apos;t be changed. The code at an address is
          always the code that was published there.
        </li>
        <li>Durables never runs the code people publish.</li>
      </ul>

      <h2>Using code from Durables</h2>
      <p>
        Published activities come from the community, and the checks Durables
        shows are automated. Read code before you run it, and treat it as you
        would any open-source dependency.
      </p>

      <h2>Reporting a problem</h2>
      <p>
        If you find a vulnerability in Durables, or a published activity that
        looks malicious, email{" "}
        <a href="mailto:security@durables.dev">security@durables.dev</a>. Please
        include enough detail to reproduce it, and give us a reasonable chance
        to fix it before you share it publicly.
      </p>
      <p>
        Durables is a free community project and can&apos;t offer a bug bounty,
        but every report is read and appreciated.
      </p>
    </LegalPage>
  );
}
