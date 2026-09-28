import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout } from "./AppLayout";
import { GroupEditorPage } from "./pages/GroupEditorPage";
import { GroupListingPage } from "./pages/GroupListingPage";
import { ListingPage } from "./pages/ListingPage";
import { PublishPage } from "./pages/PublishPage";
import { RubricPage } from "./pages/RubricPage";
import { SearchPage } from "./pages/SearchPage";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Navigate to="/publish" replace /> },
      { path: "/publish", element: <PublishPage /> },
      { path: "/rubric", element: <RubricPage /> },
      { path: "/search", element: <SearchPage /> },
      { path: "/groups/new", element: <GroupEditorPage /> },
      { path: "/:owner/groups/:nameAtVersion", element: <GroupListingPage /> },
      { path: "/:owner/:nameAtVersion", element: <ListingPage /> },
    ],
  },
]);
