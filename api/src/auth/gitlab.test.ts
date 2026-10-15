import { describe, expect, test } from "vitest";
import { gitLabAuthorizationUrl, gitLabAuthorizeUrl } from "./gitlab";

describe("gitLabAuthorizationUrl", () => {
  const url = new URL(
    gitLabAuthorizationUrl({
      clientId: "client-id",
      callbackUrl: "https://durables.dev/api/session/providers/gitlab/callback",
      state: "a-state",
    }),
  );

  test("points at GitLab's consent screen", () => {
    expect(`${url.origin}${url.pathname}`).toBe(gitLabAuthorizeUrl);
  });

  test("asks for an authorization code with identity-only scopes", () => {
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-id",
      redirect_uri:
        "https://durables.dev/api/session/providers/gitlab/callback",
      response_type: "code",
      scope: "read_user",
      state: "a-state",
    });
  });
});
