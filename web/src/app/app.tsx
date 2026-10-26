import { retryQuery } from "@/lib/query-retry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryQuery } },
});

// The providers every page needs. Routes live in router.ts.
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
