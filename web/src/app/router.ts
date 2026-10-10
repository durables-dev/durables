import { createBrowserRouter, type RouteObject } from "react-router";
import { Component as Frame, ErrorBoundary as FrameError } from "./frame-route";

// React Router in data mode (web/CONVENTIONS.md). Every page route is lazy, so each feature
// is its own chunk. A route module exports Component, loader and friends by name.
//
// Every page sits inside the frame route, which draws the header and the footer slot. The
// frame is loaded up front, not lazily: React Router renders an unknown address with the
// root route's ErrorBoundary without loading a lazy root, and every page needs it anyway.
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
    ],
  },
];

export const router = createBrowserRouter(routes);
