import { HomePage } from "./home-page";

// Route module: what React Router's lazy() loads for "/". It exports the route object's
// fields by name: Component, and later loader or ErrorBoundary.
export function Component() {
  return <HomePage />;
}
