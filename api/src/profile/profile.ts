import { Hono } from "hono";
import type { AppEnv } from "../app-env";
import { requirePublisher } from "../auth/require-publisher";
import { noStoreCacheControl } from "../http/cache-control";
import {
  ownedActivity,
  profileResponse,
  type OwnedActivitiesResponse,
  type ProfileResponse,
} from "./responses";

// The signed-in owner's profile and activities (requirements row 32). Both reads answer only
// the session's own account, so there is no handle in the path and no way to ask for anyone
// else's. Both answer 401 when signed out and are never stored, because they differ per person
// and the profile carries the email.

/** The profile resource, mounted at /api/profile. */
export const profile = new Hono<AppEnv>()
  .get("/", requirePublisher(), async (c) => {
    const { publisher, storage } = c.var;
    const account = await storage.findAccountProfile(publisher);
    c.header("Cache-Control", noStoreCacheControl);
    return c.json<ProfileResponse>(profileResponse(publisher, account), 200);
  })
  // A session with no account owns nothing, so its list is empty.
  .get("/activities", requirePublisher(), async (c) => {
    const { publisher, storage } = c.var;
    const account = await storage.findAccountByProviderIdentity(publisher);
    const listings =
      account?.handle == null
        ? []
        : await storage.listOwnedListings(account.handle);
    c.header("Cache-Control", noStoreCacheControl);
    return c.json<OwnedActivitiesResponse>(
      { activities: listings.map(ownedActivity) },
      200,
    );
  });
