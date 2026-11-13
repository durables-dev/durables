import { queryOptions } from "@tanstack/react-query";
import { parseResponse, type InferResponseType } from "hono/client";
import { api } from "./api-client";

// The SDK catalog (ADR 0013, API map T24): every SDK Durables accepts, in chip order, with
// the details web shows about it. Web holds nothing SDK-specific. It looks a profile up by the
// SDK name an api response gives it, and the wording by the activity's `runsAs`.

/** What the catalog read answers: one profile per SDK, in chip order. */
export type SdkCatalog = InferResponseType<typeof api.api.sdks.$get, 200>;

/** One SDK's display profile: its name, package, highlight language, file name and wording. */
export type SdkProfile = SdkCatalog[number];

/**
 * An SDK's name, typed as the api types it. Web holds no SDK list of its own, so an SDK the
 * api adds is a name web accepts without a change here.
 */
export type SdkName = SdkProfile["name"];

/** How an activity runs, as detection found it. */
export type RunsAsKind = keyof SdkProfile["runsAs"];

/**
 * The catalog is a query of the catalog read. The api caches it for a minute, so web does too.
 * A page waits for the first read, then each section looks its SDK up. A read that failed is
 * not tried again when a section mounts: that would put the page back to waiting, and its
 * sections would mount again, over and over.
 */
export const sdkCatalogQuery = queryOptions({
  queryKey: ["sdks"],
  queryFn: () => parseResponse(api.api.sdks.$get()),
  staleTime: 60_000,
  retryOnMount: false,
});

/** The SDK names in the catalog, in chip order. None when the catalog is not to hand. */
export function catalogSdks(catalog: SdkCatalog | undefined): SdkName[] {
  return catalog === undefined ? [] : catalog.map(({ name }) => name);
}

/**
 * The profile for `sdk`, or undefined when the catalog is not to hand or does not list it.
 * A caller then shows the SDK's name and leaves out what only the profile could say.
 */
export function sdkProfile(
  catalog: SdkCatalog | undefined,
  sdk: string,
): SdkProfile | undefined {
  return catalog?.find(({ name }) => name === sdk);
}
