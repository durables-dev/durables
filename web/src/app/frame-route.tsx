import { PageMessage } from "@/components/page-message";
import { restorePromptPath } from "@/lib/account-paths";
import {
  isRouteErrorResponse,
  Navigate,
  Outlet,
  useMatches,
  useRouteError,
} from "react-router";
import { PageFrame } from "./page-frame";
import { RestoredNotice } from "./restored-notice";
import { showsContribute, showsFooter, showsSignIn } from "./route-handle";
import { useHeldForRestore } from "./use-held-for-restore";

// Layout route module: every page renders inside the frame. A page opts out of the footer
// slot with `handle: { footer: false }`, and out of the header's Contribute button with
// `handle: { contribute: false }`, and out of its Sign in link with `handle: { signIn: false }`
// (see route-handle.ts).
//
// While a sign-in is held for the Restore choice, every other page leads back to the Restore
// prompt. After a Restore, the page it lands on shows that the account is restored.
export function Component() {
  const matches = useMatches();
  const heldForRestore = useHeldForRestore();

  if (heldForRestore) return <Navigate to={restorePromptPath} replace />;

  return (
    <PageFrame
      footer={showsFooter(matches)}
      contribute={showsContribute(matches)}
      signIn={showsSignIn(matches)}
    >
      <RestoredNotice />
      <Outlet />
    </PageFrame>
  );
}

// An unknown address, or a page that fails, still renders inside the frame, so the logo
// link home is always there.
export function ErrorBoundary() {
  const error = useRouteError();
  const heldForRestore = useHeldForRestore();
  const heading =
    isRouteErrorResponse(error) && error.status === 404
      ? "Page not found"
      : "Something went wrong";

  if (heldForRestore) return <Navigate to={restorePromptPath} replace />;

  return (
    <PageFrame>
      <PageMessage heading={heading} />
    </PageFrame>
  );
}
