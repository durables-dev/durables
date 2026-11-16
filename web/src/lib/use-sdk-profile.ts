import { useQuery } from "@tanstack/react-query";
import { sdkCatalogQuery, sdkProfile, type SdkProfile } from "./sdk-catalog";

/**
 * The catalog's profile for `sdk`. Undefined while the catalog loads, when it cannot be read,
 * and when it does not list `sdk`. Each is shown the same way: the SDK's name alone.
 */
export function useSdkProfile(sdk: string): SdkProfile | undefined {
  const { data } = useQuery(sdkCatalogQuery);
  return sdkProfile(data, sdk);
}
