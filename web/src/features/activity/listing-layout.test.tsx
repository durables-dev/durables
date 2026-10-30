import "@/styles/global.css";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ListingLayout } from "./listing-layout";
import { ListingTop } from "./listing-top";

afterEach(async () => {
  window.scrollTo(0, 0);
  await page.viewport(414, 896);
});

// Stands in for a section's content, tall enough that every section can reach the top.
function Filler({ name }: { name: string }) {
  return (
    <>
      <h2>{name}</h2>
      <div style={{ height: "1400px" }} />
    </>
  );
}

async function renderPage() {
  await page.viewport(1280, 800);
  const screen = await render(
    <ListingLayout
      top={
        <ListingTop
          title="Charge card"
          sdk="Python"
          address="ddieruf/charge-card@1.0.0"
          description="Charges a card with Stripe and returns the charge ID."
          handle="ddieruf"
          publishedAt={new Date().toISOString()}
        />
      }
      implement={<Filler name="Implement" />}
      configure={<Filler name="Configure" />}
      source={<Filler name="Source" />}
      sidebar={<p>Sidebar</p>}
    />,
  );
  const bar = screen.getByRole("navigation", { name: "Page sections" });
  await expect.element(bar).toBeVisible();
  return { screen, bar: bar.element() };
}

/** Where the section's top sits against the stuck bar's bottom, in pixels. */
function gapUnderBar(bar: Element, id: string) {
  const section = document.getElementById(id);
  return (
    (section?.getBoundingClientRect().top ?? Infinity) -
    bar.getBoundingClientRect().bottom
  );
}

test("Quickstart scrolls the page so Implement is at the top of the view", async () => {
  const { screen, bar } = await renderPage();
  expect(gapUnderBar(bar, "implement")).toBeGreaterThan(0);

  await screen.getByRole("link", { name: "Quickstart" }).click();

  await expect.poll(() => window.scrollY).toBeGreaterThan(0);
  expect(bar.getBoundingClientRect().top).toBe(0);
  const gap = gapUnderBar(bar, "implement");
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(20);
});

test.each(["Implement", "Configure", "Source"])(
  "%s in the section bar scrolls to its section, and the bar stays stuck to the top",
  async (name) => {
    const { screen, bar } = await renderPage();
    const id = name.toLowerCase();

    await screen
      .getByRole("navigation", { name: "Page sections" })
      .getByRole("link", { name })
      .click();

    await expect.poll(() => window.scrollY).toBeGreaterThan(0);
    expect(bar.getBoundingClientRect().top).toBe(0);
    const gap = gapUnderBar(bar, id);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(20);
    await expect
      .element(screen.getByRole("heading", { level: 2, name }))
      .toBeVisible();
  },
);

test("the section bar can move from a later section back to an earlier one", async () => {
  const { screen, bar } = await renderPage();
  const sections = screen.getByRole("navigation", { name: "Page sections" });

  await sections.getByRole("link", { name: "Source" }).click();
  await expect.poll(() => gapUnderBar(bar, "source")).toBeLessThan(20);
  await sections.getByRole("link", { name: "Implement" }).click();

  await expect.poll(() => gapUnderBar(bar, "implement")).toBeLessThan(20);
  expect(gapUnderBar(bar, "implement")).toBeGreaterThanOrEqual(0);
  expect(bar.getBoundingClientRect().top).toBe(0);
});

test("the bar stays stuck to the top while the page scrolls by hand", async () => {
  const { bar } = await renderPage();
  expect(bar.getBoundingClientRect().top).toBeGreaterThan(0);

  window.scrollTo(0, 2000);

  await expect.poll(() => window.scrollY).toBe(2000);
  expect(bar.getBoundingClientRect().top).toBe(0);
});
