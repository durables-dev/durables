import "@/styles/global.css";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SiteHeader } from "./site-header";

function renderHeader() {
  const router = createMemoryRouter([{ path: "/", element: <SiteHeader /> }]);
  return render(<RouterProvider router={router} />);
}

test('the logo is one link to the home page, named "Durables home"', async () => {
  const screen = await renderHeader();

  const logo = screen.getByRole("link", { name: "Durables home" });
  await expect.element(logo).toHaveAttribute("href", "/");
  await expect.element(logo).toHaveAccessibleName("Durables home");
});

test("the mark and wordmark sit at the left, with nothing at the right", async () => {
  const screen = await renderHeader();

  const header = screen.getByRole("banner");
  await expect.element(header).toBeVisible();
  expect(header.getByRole("link").elements()).toHaveLength(1);
  expect(header.getByRole("button").elements()).toHaveLength(0);

  const headerBox = header.element().getBoundingClientRect();
  const logoBox = header
    .getByRole("link", { name: "Durables home" })
    .element()
    .getBoundingClientRect();
  expect(logoBox.left - headerBox.left).toBeLessThanOrEqual(24);
  expect(logoBox.right).toBeLessThan(headerBox.left + headerBox.width / 2);
  expect(headerBox.height).toBe(60);
});

test("the wordmark is live text in Space Grotesk 600, not an image", async () => {
  const screen = await renderHeader();

  const wordmark = screen.getByText("Durables", { exact: true });
  await expect.element(wordmark).toBeVisible();
  expect(wordmark.element().tagName).not.toBe("IMG");
  const style = getComputedStyle(wordmark.element());
  expect(style.fontFamily).toContain("Space Grotesk");
  expect(style.fontWeight).toBe("600");
});

test("the picture offers the Cream mark under a light scheme and the Ink mark by default", async () => {
  const screen = await renderHeader();

  const picture = screen.container.querySelector("picture");
  const sources = picture?.querySelectorAll("source") ?? [];
  expect(sources).toHaveLength(1);
  expect(sources[0]?.getAttribute("media")).toBe(
    "(prefers-color-scheme: light)",
  );
  expect(sources[0]?.getAttribute("srcset")).toBe(
    "/durables-mark-on-cream.svg",
  );
  expect(picture?.querySelector("img")?.getAttribute("src")).toBe(
    "/durables-mark-on-ink.svg",
  );
});

test("both mark files resolve to the site's own origin", async () => {
  const screen = await renderHeader();

  const picture = screen.container.querySelector("picture");
  const paths = [
    picture?.querySelector("source")?.getAttribute("srcset"),
    picture?.querySelector("img")?.getAttribute("src"),
  ];
  for (const path of paths) {
    expect(path).toBeTruthy();
    expect(new URL(path ?? "", document.baseURI).origin).toBe(location.origin);
  }
});

test("the header carries no Temporal wording, logo or colour", async () => {
  const screen = await renderHeader();

  const header = screen.getByRole("banner").element();
  expect(header.textContent).toBe("Durables");
  expect(header.textContent).not.toMatch(/temporal|official/i);

  const images = [...header.querySelectorAll("img, source")].map(
    (image) => image.getAttribute("src") ?? image.getAttribute("srcset"),
  );
  expect(images.sort()).toEqual([
    "/durables-mark-on-cream.svg",
    "/durables-mark-on-ink.svg",
  ]);

  // The header draws on the page background, with text in the theme's foreground token.
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement("span");
  probe.style.color = root.getPropertyValue("--fg");
  document.body.append(probe);
  const fg = getComputedStyle(probe).color;
  probe.remove();
  expect(getComputedStyle(header).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(
    getComputedStyle(screen.getByText("Durables", { exact: true }).element())
      .color,
  ).toBe(fg);
});
