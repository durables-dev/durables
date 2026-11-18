import { expect, test } from "vitest";
import {
  accountRestoredState,
  isAccountRestoredState,
} from "./account-restored";

test("the state Restore navigates with says the account was restored", () => {
  expect(isAccountRestoredState(accountRestoredState)).toBe(true);
});

test("any other router state does not", () => {
  for (const state of [
    null,
    undefined,
    {},
    { accountRestored: false },
    { accountRestored: "true" },
    { from: "/" },
  ]) {
    expect(isAccountRestoredState(state)).toBe(false);
  }
});
