import { createBrowserRouter } from "react-router";

// React Router in data mode (web/CONVENTIONS.md). Every route is lazy, so each feature is
// its own chunk. A route module exports Component, loader and friends by name.
export const router = createBrowserRouter([
  {
    path: "/",
    lazy: () => import("@/features/home/home-route"),
  },
]);
