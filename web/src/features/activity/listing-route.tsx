import { PageMessage } from "@/components/page-message";
import { useParams } from "react-router";
import { parseListingAddress } from "./listing-address";
import { ListingPage } from "./listing-page";

// Route module: what React Router's lazy() loads for "/:handle/:nameAtVersion", a listing's
// address such as /ddieruf/charge-card@1.0.0. A path that cannot be an address, including one
// whose handle is reserved for a site page, is not found without asking the API.
export function Component() {
  const address = parseListingAddress(useParams());

  if (address === undefined) {
    return <PageMessage heading="Page not found" />;
  }
  return <ListingPage address={address} />;
}
