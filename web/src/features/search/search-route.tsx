import { readSearch } from "@/lib/search-address";
import { useSearchParams } from "react-router";
import { SearchPage } from "./search-page";

// Route module: what React Router's lazy() loads for "/search". The words and filters live in
// the address, so a refresh, Back or a shared link opens the same search.
export function Component() {
  const [params] = useSearchParams();
  return <SearchPage search={readSearch(params)} />;
}
