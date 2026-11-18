import {
  handleSchema,
  listingNameSchema,
  versionNumberSchema,
} from "@durables/schemas";
import { z } from "zod";
import {
  contributeEntryState,
  contributeOriginSchema,
} from "./contribute-origin";

// How the Activity page opens Contribute in new-version mode. The router state of the link
// names the listing and the version to start from, and the page it was followed from. The
// Activity page and Contribute are separate features, so the shape lives here.

/** The listing a new version is for, and the version it starts from. */
export interface NewVersionBase {
  handle: string;
  name: string;
  /** The version the new one is based on. */
  basedOn: string;
}

export const newVersionBaseSchema = z.object({
  handle: handleSchema,
  name: listingNameSchema,
  basedOn: versionNumberSchema,
});

/** Where Start from {version} goes. The flow sends it on to its first step. */
export const newVersionEntryPath = "/contribute";

/** The router state for Start from {version}: the base, and the page the link sits on. */
export interface NewVersionEntryState {
  from: string;
  newVersion: NewVersionBase;
}

/** The state that opens Contribute in new-version mode from the page at `location`. */
export function newVersionEntryState(
  base: NewVersionBase,
  location: { pathname: string; search: string },
): NewVersionEntryState {
  return { ...contributeEntryState(location), newVersion: base };
}

const entryStateSchema = z.object({
  from: contributeOriginSchema.optional(),
  newVersion: newVersionBaseSchema,
});

/** The base the flow was opened with, or undefined when the router state names none. */
export function newVersionFromEntryState(
  state: unknown,
): NewVersionBase | undefined {
  const parsed = entryStateSchema.safeParse(state);
  return parsed.success ? parsed.data.newVersion : undefined;
}
