import { originFromEntryState } from "@/lib/contribute-origin";
import { useLocation } from "react-router";
import { ContributeDraftProvider } from "./contribute-draft-provider";
import { ContributePage } from "./contribute-page";

// Route module: what React Router's lazy() loads for "/contribute/:step?". The draft lives
// here, so it is kept while the publisher moves between steps. The link that opened the flow
// may name the page it was followed from; the draft keeps it for Back.
export function Component() {
  const location = useLocation();

  return (
    <ContributeDraftProvider entryOrigin={originFromEntryState(location.state)}>
      <ContributePage />
    </ContributeDraftProvider>
  );
}
