import { readSearch, searchAddress } from "@/lib/search-address";
import { useNavigate, useSearchParams } from "react-router";
import { SearchPage } from "./search-page";

// Route module: what React Router's lazy() loads for "/search". The words and filters live in
// the address, so a refresh, Back or a shared link opens the same search. Every change the
// page makes is a new address.
export function Component() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (
    <SearchPage
      search={readSearch(params)}
      onSearch={(search) => {
        void navigate(searchAddress(search));
      }}
    />
  );
}
