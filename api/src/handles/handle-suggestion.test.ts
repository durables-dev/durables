import { handlePattern, isReservedHandle } from "@durables/schemas";
import { describe, expect, test } from "vitest";
import {
  cleanHandle,
  handleMaxLength,
  suggestHandle,
} from "./handle-suggestion";

describe("suggestHandle for GitHub and GitLab", () => {
  test("suggests the cleaned GitHub username", () => {
    expect(suggestHandle({ provider: "github", username: "Octo_Cat" })).toBe(
      "octo-cat",
    );
  });

  test("cleans the GitLab username the same way", () => {
    expect(suggestHandle({ provider: "gitlab", username: "Octo_Cat" })).toBe(
      "octo-cat",
    );
  });

  test.each(["github", "gitlab"] as const)(
    "takes the %s username, never the email",
    (provider) => {
      expect(
        suggestHandle({
          provider,
          username: "ghopper",
          email: "grace@example.com",
        }),
      ).toBe("ghopper");
    },
  );

  test.each(["github", "gitlab"] as const)(
    "suggests nothing for %s without a username",
    (provider) => {
      expect(
        suggestHandle({ provider, email: "grace@example.com" }),
      ).toBeUndefined();
    },
  );
});

describe("suggestHandle for Google and Microsoft", () => {
  test("suggests the cleaned part of a Google email before the @", () => {
    expect(
      suggestHandle({ provider: "google", email: "jane.doe+x@example.com" }),
    ).toBe("jane-doe-x");
  });

  test("uses the part of a Microsoft email before the @", () => {
    expect(
      suggestHandle({
        provider: "microsoft",
        email: "Ada.Lovelace@contoso.example",
      }),
    ).toBe("ada-lovelace");
  });

  test.each(["google", "microsoft"] as const)(
    "takes the %s email, never a username",
    (provider) => {
      expect(
        suggestHandle({
          provider,
          username: "ghopper",
          email: "grace@example.com",
        }),
      ).toBe("grace");
    },
  );

  test.each(["google", "microsoft"] as const)(
    "suggests nothing for %s without an email",
    (provider) => {
      expect(suggestHandle({ provider })).toBeUndefined();
    },
  );

  test("suggests nothing for an email with no @", () => {
    expect(
      suggestHandle({ provider: "microsoft", email: "ada_contoso#EXT" }),
    ).toBeUndefined();
  });

  test("never carries any of the domain into the suggestion", () => {
    expect(
      suggestHandle({ provider: "google", email: "ada@lovelace.example" }),
    ).toBe("ada");
  });
});

describe("cleanHandle", () => {
  test("lowercases", () => {
    expect(cleanHandle("DDieruf")).toBe("ddieruf");
  });

  test("replaces disallowed characters with hyphens", () => {
    expect(cleanHandle("a.b_c+d e")).toBe("a-b-c-d-e");
  });

  test("replaces letters outside a to z with hyphens", () => {
    expect(cleanHandle("josé-ñ1")).toBe("jos-1");
  });

  test("collapses repeated hyphens", () => {
    expect(cleanHandle("ada--lovelace")).toBe("ada-lovelace");
    expect(cleanHandle("ada._-lovelace")).toBe("ada-lovelace");
  });

  test("trims leading and trailing hyphens", () => {
    expect(cleanHandle("--ada-lovelace--")).toBe("ada-lovelace");
    expect(cleanHandle("_ada_")).toBe("ada");
  });

  test("truncates a result over 39 characters to 39, and it stays valid", () => {
    const cleaned = cleanHandle("a".repeat(50));

    expect(cleaned).toBe("a".repeat(handleMaxLength));
    expect(cleaned).toMatch(handlePattern);
  });

  test("drops a hyphen that truncation leaves at the end", () => {
    // The 39th character is the hyphen between the two words.
    const cleaned = cleanHandle(`${"a".repeat(38)}_bcdef`);

    expect(cleaned).toBe("a".repeat(38));
    expect(cleaned).toMatch(handlePattern);
  });

  test("keeps exactly 3 characters", () => {
    expect(cleanHandle("abc")).toBe("abc");
    expect(cleanHandle("A_b")).toBe("a-b");
  });

  test.each(["", "ab", "a_", "__", "-a-", "..x..", "日本語"])(
    "suggests nothing when %j cleans to under 3 characters",
    (source) => {
      expect(cleanHandle(source)).toBeUndefined();
    },
  );

  test.each([
    "Octo_Cat",
    "jane.doe+x",
    "  spaced  out  ",
    "UPPER.lower_123",
    `${"x-".repeat(30)}y`,
  ])("always gives a handle the format rule accepts, from %j", (source) => {
    expect(cleanHandle(source)).toMatch(handlePattern);
  });
});

describe("a suggestion that cannot be had", () => {
  test("is still returned when it is a reserved word", () => {
    const suggestion = suggestHandle({
      provider: "google",
      email: "admin@example.com",
    });

    expect(suggestion).toBe("admin");
    expect(isReservedHandle(suggestion ?? "")).toBe(true);
  });

  test("is still returned when the username cleans to a reserved word", () => {
    expect(suggestHandle({ provider: "github", username: "Temporal" })).toBe(
      "temporal",
    );
  });
});
