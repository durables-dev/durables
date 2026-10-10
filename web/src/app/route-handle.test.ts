import { expect, test } from "vitest";
import { showsFooter } from "./route-handle";

test("shows the footer when no route sets a handle", () => {
  expect(showsFooter([{ handle: undefined }, { handle: undefined }])).toBe(
    true,
  );
});

test("shows the footer when a route's handle does not mention it", () => {
  expect(showsFooter([{ handle: {} }, { handle: { footer: true } }])).toBe(
    true,
  );
});

test("hides the footer when any matched route opts out", () => {
  expect(
    showsFooter([{ handle: undefined }, { handle: { footer: false } }]),
  ).toBe(false);
});
