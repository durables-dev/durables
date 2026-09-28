import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { CurrentUserProvider } from "./auth/CurrentUserProvider";
import { router } from "./routes";
import "./global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CurrentUserProvider>
      <RouterProvider router={router} />
    </CurrentUserProvider>
  </StrictMode>,
);
