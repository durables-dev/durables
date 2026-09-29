import { request } from "./client";
import type { Check, Declarations, Detection, Listing, PublishRequest, PublishResult, VersionSuggestion } from "./types";

export function detectActivity(code: string): Promise<Detection> {
  return request<Detection>("POST", "/activities/detect", { code });
}

/** The version to publish the pasted code as, with the reasons, compared with the signed-in user's highest published version. */
export function suggestVersion(code: string): Promise<VersionSuggestion> {
  return request<VersionSuggestion>("POST", "/activities/version-suggestion", { code });
}

export async function checkActivity(code: string, declarations: Declarations): Promise<Check[]> {
  const { checks } = await request<{ checks: Check[] }>("POST", "/activities/check", { code, declarations });
  return checks;
}

export function publishActivity(body: PublishRequest): Promise<PublishResult> {
  return request<PublishResult>("POST", "/activities", body);
}

/** The listing for one version, or for the default version when `version` is absent. */
export function getListing(owner: string, name: string, version?: string): Promise<Listing> {
  const path = `/activities/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return request<Listing>("GET", version ? `${path}/${encodeURIComponent(version)}` : path);
}
