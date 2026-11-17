import { createBrowserRouter, type RouteObject } from "react-router";
import { Component as Frame, ErrorBoundary as FrameError } from "./frame-route";
import type { RouteHandle } from "./route-handle";

const contributeHandle: RouteHandle = {
  footer: false,
  contribute: false,
  signIn: false,
};
const signInHandle: RouteHandle = { signIn: false };

// React Router in data mode (web/CONVENTIONS.md). Every page route is lazy, so each feature
// is its own chunk. A route module exports Component, loader and friends by name.
//
// Every page sits inside the frame route, which draws the header and the footer slot. The
// frame is loaded up front, not lazily: React Router renders an unknown address with the
// root route's ErrorBoundary without loading a lazy root, and every page needs it anyway.
// Every top-level path is on the reserved-handle list in @durables/schemas.
export const routes: RouteObject[] = [
  {
    id: "frame",
    Component: Frame,
    ErrorBoundary: FrameError,
    children: [
      {
        path: "/",
        lazy: () => import("@/features/home/home-route"),
      },
      {
        // The step is in the address. The flow has no footer and no Contribute button or Sign
        // in link in its header, as the contribute canvas shows.
        path: "/contribute/:step?",
        lazy: () => import("@/features/contribute/contribute-route"),
        handle: contributeHandle,
      },
      {
        // The Sign in page. The header leaves out its own Sign in link here. The page to
        // return to after signing in is in the address's search params.
        path: "/sign-in",
        lazy: () => import("@/features/account/sign-in-route"),
        handle: signInHandle,
      },
      {
        // The signed-in owner's profile. Only its owner can see it.
        path: "/profile",
        lazy: () => import("@/features/account/profile-route"),
      },
      {
        // The results page. The words and filters are in the address's search params.
        path: "/search",
        lazy: () => import("@/features/search/search-route"),
      },
      {
        path: "/terms",
        lazy: () => import("@/features/legal/terms-route"),
      },
      {
        path: "/privacy",
        lazy: () => import("@/features/legal/privacy-route"),
      },
      {
        path: "/security",
        lazy: () => import("@/features/legal/security-route"),
      },
      {
        // A listing's address, /<handle>/<name>@<version>. Every site page's path is a
        // reserved handle, so it can never be read as a listing.
        path: "/:handle/:nameAtVersion",
        lazy: () => import("@/features/activity/listing-route"),
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
