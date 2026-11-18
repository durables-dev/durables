import { catalogSdks, sdkCatalogQuery } from "@/lib/sdk-catalog";
import { readSearch, searchAddress } from "@/lib/search-address";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { SearchPage } from "./search-page";
import styles from "./search-route.module.css";

// Route module: what React Router's lazy() loads for "/search". The words and filters live in
// the address, so a refresh, Back or a shared link opens the same search. Every change the
// page makes is a new address. An SDK in the address counts only when the SDK catalog lists
// it, so the page waits for the catalog. If the catalog cannot be read, no SDK counts.
export function Component() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const catalog = useQuery(sdkCatalogQuery);

  if (catalog.isPending) {
    return (
      <p className={styles["loading"]} role="status">
        Loading the search…
      </p>
    );
  }
  return (
    <SearchPage
      search={readSearch(params, catalogSdks(catalog.data))}
      onSearch={(search) => {
        void navigate(searchAddress(search));
      }}
    />
  );
}
