import { describe, expect, test } from "vitest";
import { sessionHandle } from "./session-handle";

const account = { id: "account-1", handle: "ada" };

describe("sessionHandle", () => {
  test("returns the account's handle when the account exists and the cookie holds none", () => {
    expect(sessionHandle({ handle: null }, account)).toEqual({
      handle: "ada",
      accountExists: true,
    });
  });

  test("returns the account's handle when the cookie holds a different one", () => {
    expect(sessionHandle({ handle: "someone-else" }, account)).toEqual({
      handle: "ada",
      accountExists: true,
    });
  });

  test("returns the cookie's chosen handle before the account exists", () => {
    expect(sessionHandle({ handle: "chosen" }, undefined)).toEqual({
      handle: "chosen",
      accountExists: false,
    });
  });

  test("returns an empty handle before the account exists and before one is chosen", () => {
    expect(sessionHandle({ handle: null }, undefined)).toEqual({
      handle: null,
      accountExists: false,
    });
  });
});
