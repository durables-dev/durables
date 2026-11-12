import { siteDescription } from "@/lib/page-title";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PageTitle } from "./page-title";

test("sets the tab title to the site name on the home page", async () => {
  await render(<PageTitle />);

  await expect.poll(() => document.title).toBe("Durables");
});

test("sets the tab title to the page, then the site name, on a named page", async () => {
  await render(<PageTitle page="Terms" />);

  await expect.poll(() => document.title).toBe("Terms · Durables");
});

const descriptions = () =>
  [...document.head.querySelectorAll('meta[name="description"]')].map((meta) =>
    meta.getAttribute("content"),
  );

test("gives a page without a description of its own the site's description", async () => {
  await render(<PageTitle />);

  await expect.poll(descriptions).toEqual([siteDescription]);
});

test("puts exactly one description in the head, the page's own", async () => {
  await render(<PageTitle page="Terms" description="The terms." />);

  await expect.poll(descriptions).toEqual(["The terms."]);
});
