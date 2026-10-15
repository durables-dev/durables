import { describe, expect, test } from "vitest";
import { identityFromProviderUser } from "./provider-identity";

describe("identityFromProviderUser for GitHub", () => {
  test("keeps the name, email, avatar and account ID", () => {
    expect(
      identityFromProviderUser("github", {
        id: 4242,
        login: "ada",
        name: "Ada Lovelace",
        email: "ada@example.com",
        avatar_url: "https://avatars.example.com/ada",
        company: "Analytical Engines",
      }),
    ).toEqual({
      provider: "github",
      providerAccountId: "4242",
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: "https://avatars.example.com/ada",
    });
  });

  test("uses the username when the account has no name", () => {
    expect(
      identityFromProviderUser("github", { id: 1, login: "ada", name: null }),
    ).toMatchObject({ name: "ada" });
  });

  test("completes without an email when the provider returns none", () => {
    const identity = identityFromProviderUser("github", {
      id: 1,
      login: "ada",
      name: "Ada",
      email: null,
    });

    expect(identity).toEqual({
      provider: "github",
      providerAccountId: "1",
      name: "Ada",
    });
  });

  test("is not an identity without a name or username", () => {
    expect(
      identityFromProviderUser("github", { id: 1, name: null }),
    ).toBeUndefined();
  });

  test("is not an identity without an account ID", () => {
    expect(
      identityFromProviderUser("github", { login: "ada", name: "Ada" }),
    ).toBeUndefined();
  });
});

describe("identityFromProviderUser for Google", () => {
  test("keeps the name, email, picture and account ID", () => {
    expect(
      identityFromProviderUser("google", {
        id: "g-1",
        name: "Ada Lovelace",
        given_name: "Ada",
        email: "ada@example.com",
        picture: "https://example.com/ada.png",
        verified_email: true,
      }),
    ).toEqual({
      provider: "google",
      providerAccountId: "g-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: "https://example.com/ada.png",
    });
  });

  test("uses the given name when there is no full name", () => {
    expect(
      identityFromProviderUser("google", { id: "g-1", given_name: "Ada" }),
    ).toMatchObject({ name: "Ada" });
  });

  test("never uses an email address as the name", () => {
    expect(
      identityFromProviderUser("google", {
        id: "g-1",
        name: "ada@example.com",
        email: "ada@example.com",
      }),
    ).toBeUndefined();
  });
});

describe("identityFromProviderUser for Microsoft", () => {
  test("keeps the display name, mail and account ID, with no avatar", () => {
    expect(
      identityFromProviderUser("microsoft", {
        id: "m-1",
        displayName: "Ada Lovelace",
        mail: "ada@example.com",
        userPrincipalName: "ada@contoso.example",
      }),
    ).toEqual({
      provider: "microsoft",
      providerAccountId: "m-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
  });

  test("takes the email from the principal name when there is no mail", () => {
    expect(
      identityFromProviderUser("microsoft", {
        id: "m-1",
        displayName: "Ada",
        mail: null,
        userPrincipalName: "ada@outlook.example",
      }),
    ).toMatchObject({ email: "ada@outlook.example" });
  });

  test("skips a display name that is an email address", () => {
    expect(
      identityFromProviderUser("microsoft", {
        id: "m-1",
        displayName: "ada@outlook.example",
        givenName: "Ada",
      }),
    ).toMatchObject({ name: "Ada" });
  });

  test("completes without an email when there is none", () => {
    expect(
      identityFromProviderUser("microsoft", {
        id: "m-1",
        displayName: "Ada",
        userPrincipalName: "ada_contoso#EXT",
      }),
    ).toEqual({ provider: "microsoft", providerAccountId: "m-1", name: "Ada" });
  });
});

describe("identityFromProviderUser for GitLab", () => {
  test("keeps the name, username, email, avatar and account ID", () => {
    expect(
      identityFromProviderUser("gitlab", {
        id: 31,
        username: "ghopper",
        name: "Grace Hopper",
        email: "grace@example.com",
        avatar_url: "https://gitlab.example.com/grace.png",
        state: "active",
        bio: "COBOL",
      }),
    ).toEqual({
      provider: "gitlab",
      providerAccountId: "31",
      name: "Grace Hopper",
      username: "ghopper",
      email: "grace@example.com",
      avatarUrl: "https://gitlab.example.com/grace.png",
    });
  });

  test("uses the username when the account has no name", () => {
    expect(
      identityFromProviderUser("gitlab", { id: 31, username: "ghopper" }),
    ).toMatchObject({ name: "ghopper", username: "ghopper" });
  });

  test("falls back to the public email when there is no primary email", () => {
    expect(
      identityFromProviderUser("gitlab", {
        id: 31,
        username: "ghopper",
        public_email: "grace@public.example",
      }),
    ).toMatchObject({ email: "grace@public.example" });
  });

  test("completes without an email when there is none", () => {
    expect(
      identityFromProviderUser("gitlab", {
        id: 31,
        username: "ghopper",
        name: "Grace",
        email: null,
      }),
    ).toEqual({
      provider: "gitlab",
      providerAccountId: "31",
      name: "Grace",
      username: "ghopper",
    });
  });

  test("never uses an email address as the name", () => {
    expect(
      identityFromProviderUser("gitlab", {
        id: 31,
        name: "grace@example.com",
      }),
    ).toBeUndefined();
  });

  test("is not an identity without an account ID", () => {
    expect(
      identityFromProviderUser("gitlab", {
        username: "ghopper",
        name: "Grace",
      }),
    ).toBeUndefined();
  });
});
