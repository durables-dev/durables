import { z } from "zod";
import { identityScopes } from "./oauth-providers";

// GitLab sign-in, hand-written because @hono/oauth-providers has no GitLab flow (ADR 0007,
// api/CONVENTIONS.md). It follows the same authorization code flow the package runs for the
// other providers: redirect with a state, then exchange the code and read the user.
//
// The access token lives only inside fetchGitLabUser. It is never returned, stored or logged,
// and the errors thrown here never quote GitLab's answer, which may echo the code.

export const gitLabAuthorizeUrl = "https://gitlab.com/oauth/authorize";
export const gitLabTokenUrl = "https://gitlab.com/oauth/token";
export const gitLabUserUrl = "https://gitlab.com/api/v4/user";

/** The code exchange failed: GitLab refused the code or could not be reached. */
export class GitLabExchangeError extends Error {
  constructor() {
    super("The GitLab code exchange failed");
    this.name = "GitLabExchangeError";
  }
}

/** The exchange succeeded, but reading the GitLab user failed. */
export class GitLabProfileError extends Error {
  constructor() {
    super("Reading the GitLab user failed");
    this.name = "GitLabProfileError";
  }
}

/** GitLab's consent screen, asking only for the identity scope and carrying the state. */
export const gitLabAuthorizationUrl = ({
  clientId,
  callbackUrl,
  state,
}: {
  clientId: string;
  callbackUrl: string;
  state: string;
}): string => {
  const url = new URL(gitLabAuthorizeUrl);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: identityScopes.gitlab.join(" "),
    state,
  }).toString();
  return url.href;
};

const tokenResponse = z.object({ access_token: z.string().min(1) });

const exchangeCode = async (
  { clientId, clientSecret }: { clientId: string; clientSecret: string },
  code: string,
  callbackUrl: string,
): Promise<string> => {
  let response: Response;
  try {
    response = await fetch(gitLabTokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl,
      }),
    });
  } catch {
    throw new GitLabExchangeError();
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new GitLabExchangeError();
  }
  const parsed = tokenResponse.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!parsed.success) {
    throw new GitLabExchangeError();
  }
  return parsed.data.access_token;
};

const readUser = async (accessToken: string): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(gitLabUserUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch {
    throw new GitLabProfileError();
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new GitLabProfileError();
  }
  try {
    return await response.json();
  } catch {
    throw new GitLabProfileError();
  }
};

/**
 * Exchanges the code for an access token, reads the GitLab user with it, and returns the
 * user record. The token is dropped when this returns.
 */
export const fetchGitLabUser = async (
  client: { clientId: string; clientSecret: string },
  code: string,
  callbackUrl: string,
): Promise<unknown> => readUser(await exchangeCode(client, code, callbackUrl));
