import { originFromEntryState } from "@/lib/contribute-origin";
import { newVersionFromEntryState } from "@/lib/new-version-entry";
import { useLocation } from "react-router";
import { ContributeDraftProvider } from "./contribute-draft-provider";
import { ContributePage } from "./contribute-page";

// Route module: what React Router's lazy() loads for "/contribute/:step?". The draft lives
// here, so it is kept while the publisher moves between steps. The link that opened the flow
// may name the page it was followed from; the draft keeps it for Back. A link from an Activity
// page's Create new version dialog also names the version to start from, which opens the flow
// in new-version mode.
export function Component() {
  const location = useLocation();

  return (
    <ContributeDraftProvider
      entryOrigin={originFromEntryState(location.state)}
      entryNewVersion={newVersionFromEntryState(location.state)}
    >
      <ContributePage />
    </ContributeDraftProvider>
  );
}
