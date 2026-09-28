import { request } from "./client";
import type { GroupListing, PublishGroupRequest, PublishGroupResult, ResolvedGroup } from "./types";

/** Sends the group editor's full text. Always answers with the file to show next, problems included. */
export function resolveGroup(source: string, sdk: "python" = "python"): Promise<ResolvedGroup> {
  return request<ResolvedGroup>("POST", "/groups/resolve", { sdk, source });
}

export function publishGroup(body: PublishGroupRequest): Promise<PublishGroupResult> {
  return request<PublishGroupResult>("POST", "/groups", body);
}

/** The group listing for one version, or for the default version when `version` is absent. */
export function getGroupListing(owner: string, name: string, version?: string): Promise<GroupListing> {
  const path = `/groups/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return request<GroupListing>("GET", version ? `${path}/${encodeURIComponent(version)}` : path);
}
