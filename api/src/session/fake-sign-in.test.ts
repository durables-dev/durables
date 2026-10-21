import { describe, expect, test } from "vitest";
import { fakeIdentitySchema, fakeProviderAccountId } from "./fake-sign-in";

describe("fakeIdentitySchema", () => {
  test("accepts a name alone and signs in as GitHub", () => {
    expect(fakeIdentitySchema.parse({ name: "Ada Lovelace" })).toEqual({
      name: "Ada Lovelace",
      provider: "github",
    });
  });

  test("keeps every field of a fully named identity", () => {
    expect(
      fakeIdentitySchema.parse({
        name: " Grace Hopper ",
        email: "grace@example.com",
        provider: "gitlab",
        username: "ghopper",
        providerAccountId: "acct-1",
      }),
    ).toEqual({
      name: "Grace Hopper",
      email: "grace@example.com",
      provider: "gitlab",
      username: "ghopper",
      providerAccountId: "acct-1",
    });
  });

  test.each([{}, { name: "" }, { name: "  " }, { name: 7 }])(
    "refuses %j with a message on the name",
    (input) => {
      const result = fakeIdentitySchema.safeParse(input);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({
        path: ["name"],
        message: "Name the identity to sign in as.",
      });
    },
  );

  test("refuses a name that is an email address", () => {
    const result = fakeIdentitySchema.safeParse({ name: "ada@example.com" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["name"]);
  });

  test("refuses an email that is not an email address", () => {
    const result = fakeIdentitySchema.safeParse({
      name: "Ada",
      email: "not-an-email",
    });

    expect(result.error?.issues[0]?.path).toEqual(["email"]);
  });

  test("refuses a provider outside the four", () => {
    const result = fakeIdentitySchema.safeParse({
      name: "Ada",
      provider: "bitbucket",
    });

    expect(result.error?.issues[0]?.path).toEqual(["provider"]);
  });
});

describe("fakeProviderAccountId", () => {
  test("is the same for the same name and different for different names", () => {
    expect(fakeProviderAccountId("Ada")).toBe(fakeProviderAccountId("Ada"));
    expect(fakeProviderAccountId("Ada")).not.toBe(
      fakeProviderAccountId("Alan"),
    );
  });
});
