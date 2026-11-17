import { PageMessage } from "@/components/page-message";
import {
  isRouteErrorResponse,
  Outlet,
  useMatches,
  useRouteError,
} from "react-router";
import { PageFrame } from "./page-frame";
import { showsContribute, showsFooter, showsSignIn } from "./route-handle";

// Layout route module: every page renders inside the frame. A page opts out of the footer
// slot with `handle: { footer: false }`, and out of the header's Contribute button with
// `handle: { contribute: false }`, and out of its Sign in link with `handle: { signIn: false }`
// (see route-handle.ts).
export function Component() {
  const matches = useMatches();

  return (
    <PageFrame
      footer={showsFooter(matches)}
      contribute={showsContribute(matches)}
      signIn={showsSignIn(matches)}
    >
      <Outlet />
    </PageFrame>
  );
}

// An unknown address, or a page that fails, still renders inside the frame, so the logo
// link home is always there.
export function ErrorBoundary() {
  const error = useRouteError();
  const heading =
    isRouteErrorResponse(error) && error.status === 404
      ? "Page not found"
      : "Something went wrong";

  return (
    <PageFrame>
      <PageMessage heading={heading} />
    </PageFrame>
  );
}
