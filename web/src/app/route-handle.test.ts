import { expect, test } from "vitest";
import { showsContribute, showsFooter, showsSignIn } from "./route-handle";

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

test("shows the Contribute button when no route sets a handle", () => {
  expect(showsContribute([{ handle: undefined }, { handle: {} }])).toBe(true);
});

test("hides the Contribute button when any matched route opts out", () => {
  expect(
    showsContribute([{ handle: undefined }, { handle: { contribute: false } }]),
  ).toBe(false);
});

test("the footer and the Contribute button opt out independently", () => {
  expect(showsContribute([{ handle: { footer: false } }])).toBe(true);
  expect(showsFooter([{ handle: { contribute: false } }])).toBe(true);
});

test("shows the Sign in link when no route sets a handle", () => {
  expect(showsSignIn([{ handle: undefined }, { handle: {} }])).toBe(true);
});

test("hides the Sign in link when any matched route opts out", () => {
  expect(
    showsSignIn([{ handle: undefined }, { handle: { signIn: false } }]),
  ).toBe(false);
});

test("the Sign in link opts out independently of the Contribute button and footer", () => {
  expect(showsSignIn([{ handle: { contribute: false, footer: false } }])).toBe(
    true,
  );
  expect(showsContribute([{ handle: { signIn: false } }])).toBe(true);
  expect(showsFooter([{ handle: { signIn: false } }])).toBe(true);
});
