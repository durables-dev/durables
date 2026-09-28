import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout } from "./AppLayout";
import { ListingPage } from "./pages/ListingPage";
import { PublishPage } from "./pages/PublishPage";
import { RubricPage } from "./pages/RubricPage";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Navigate to="/publish" replace /> },
      { path: "/publish", element: <PublishPage /> },
      { path: "/rubric", element: <RubricPage /> },
      { path: "/:owner/:nameAtVersion", element: <ListingPage /> },
    ],
  },
]);
