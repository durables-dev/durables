import { expect, test } from "vitest";
import { pageTitle } from "./page-title";

test("the home page's title is the site name alone", () => {
  expect(pageTitle()).toBe("Durables");
});

test("a named page's title is the page, then the site name", () => {
  expect(pageTitle("Terms")).toBe("Terms · Durables");
});
