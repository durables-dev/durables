import { describe, expect, test } from "vitest";
import type { ProviderDetails } from "./profile-queries";
import { providerName, providerRows } from "./provider-rows";

const details: ProviderDetails = {
  name: "David Dieruf",
  email: "david@example.com",
  username: "ddieruf",
  avatarUrl: "https://avatars.example.test/u/48213907",
  providerAccountId: "48213907",
};

describe("providerName", () => {
  test("names each provider as people know it", () => {
    expect(providerName("github")).toBe("GitHub");
    expect(providerName("gitlab")).toBe("GitLab");
    expect(providerName("google")).toBe("Google");
    expect(providerName("microsoft")).toBe("Microsoft");
  });
});

describe("providerRows", () => {
  test("GitHub has Name, Email, GitHub username, Avatar and Account ID, in that order", () => {
    expect(providerRows("github", details)).toEqual([
      { label: "Name", value: "David Dieruf", mono: false },
      { label: "Email", value: "david@example.com", mono: false },
      { label: "GitHub username", value: "ddieruf", mono: true },
      { label: "Avatar", value: "Your GitHub profile picture", mono: false },
      { label: "Account ID", value: "48213907", mono: true },
    ]);
  });

  test("GitLab has a GitLab username row", () => {
    expect(providerRows("gitlab", details).map(({ label }) => label)).toEqual([
      "Name",
      "Email",
      "GitLab username",
      "Avatar",
      "Account ID",
    ]);
  });

  test("Google and Microsoft have no username row", () => {
    for (const provider of ["google", "microsoft"] as const) {
      expect(
        providerRows(provider, { ...details, username: null }).map(
          ({ label }) => label,
        ),
      ).toEqual(["Name", "Email", "Avatar", "Account ID"]);
    }
  });

  test("the avatar is described in words, never as its address", () => {
    const avatar = providerRows("google", details).find(
      ({ label }) => label === "Avatar",
    );
    expect(avatar?.value).toBe("Your Google profile picture");
  });

  test("a value the provider did not give keeps its row, with no value", () => {
    const rows = providerRows("github", {
      ...details,
      email: null,
      username: null,
      avatarUrl: null,
    });
    expect(rows.map(({ label, value }) => [label, value])).toEqual([
      ["Name", "David Dieruf"],
      ["Email", null],
      ["GitHub username", null],
      ["Avatar", null],
      ["Account ID", "48213907"],
    ]);
  });
});
