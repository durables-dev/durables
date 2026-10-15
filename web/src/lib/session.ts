import { queryOptions } from "@tanstack/react-query";
import { parseResponse, type InferResponseType } from "hono/client";
import { api } from "./api-client";

/** What the session endpoint answers. `user` is null for an anonymous visitor. */
export type Session = InferResponseType<typeof api.api.session.$get, 200>;

/** The signed-in publisher, as the session endpoint describes them. Never carries an email. */
export type SessionUser = NonNullable<Session["user"]>;

/** The anonymous session, as the endpoint answers it and as sign-out leaves it. */
export const signedOut: Session = { user: null };

/** The signed-in user is a query of the session endpoint (web/CONVENTIONS.md, State). */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: () => parseResponse(api.api.session.$get()),
});

/** Ends the session. The endpoint answers 204, signed in or not. */
export async function signOut(): Promise<void> {
  await parseResponse(api.api.session.$delete());
}
