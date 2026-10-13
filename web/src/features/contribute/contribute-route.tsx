import { ContributeDraftProvider } from "./contribute-draft-provider";
import { ContributePage } from "./contribute-page";

// Route module: what React Router's lazy() loads for "/contribute/:step?". The draft lives
// here, so it is kept while the publisher moves between steps.
export function Component() {
  return (
    <ContributeDraftProvider>
      <ContributePage />
    </ContributeDraftProvider>
  );
}
