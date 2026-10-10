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
