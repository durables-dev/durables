import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export interface TestProvidersProps {
  children: ReactNode;
}

// The providers App gives every page, with a fresh Query cache per test. A failed request is
// not retried, so a test sees the failure at once.
export function TestProviders({ children }: TestProvidersProps) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
