import "@/styles/global.css";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../test/test-providers";
import { routes } from "./router";
import { SiteFooter } from "./site-footer";

function renderFooter() {
  const router = createMemoryRouter([{ path: "/", element: <SiteFooter /> }]);
  return render(<RouterProvider router={router} />);
}

// The real route tree, so a footer link lands on the real legal page.
function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
}

async function emulateColorScheme(value: "light" | "dark" | "") {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value }],
  });
}

// Resolves a custom property to the computed rgb() form the browser reports.
function tokenColor(name: string) {
  const probe = document.createElement("span");
  probe.style.color = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function hexColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16),
  );
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

afterEach(async () => {
  vi.useRealTimers();
  await emulateColorScheme("");
  await page.viewport(414, 896);
});

const credit =
  "Free for the Temporal community, maintained with love by Kisasa.";

const year = () => String(new Date().getFullYear());

test("puts the copyright at the left, the credit in the centre and the links at the right", async () => {
  await page.viewport(1280, 800);
  const screen = await renderFooter();

  const footer = screen.getByRole("contentinfo");
  const copyright = footer.getByText(`© ${year()} Durables`, { exact: true });
  const creditLine = footer.getByText(credit, { exact: true });
  const nav = footer.getByRole("navigation", { name: "Footer" });
  await expect.element(copyright).toBeVisible();
  await expect.element(creditLine).toBeVisible();
  await expect.element(nav).toBeVisible();

  const footerBox = footer.element().getBoundingClientRect();
  const copyrightBox = copyright.element().getBoundingClientRect();
  const creditBox = creditLine.element().getBoundingClientRect();
  const navBox = nav.element().getBoundingClientRect();
  expect(copyrightBox.left - footerBox.left).toBeLessThanOrEqual(24);
  expect(footerBox.right - navBox.right).toBeLessThanOrEqual(24);
  expect(copyrightBox.right).toBeLessThan(creditBox.left);
  expect(creditBox.right).toBeLessThan(navBox.left);
  // Centred on the footer, not on the space between its neighbours.
  const footerMiddle = footerBox.left + footerBox.width / 2;
  const creditMiddle = creditBox.left + creditBox.width / 2;
  expect(Math.abs(creditMiddle - footerMiddle)).toBeLessThanOrEqual(1);
  // One line: all three share a vertical centre.
  const middle = (box: DOMRect) => Math.round(box.top + box.height / 2);
  expect(middle(creditBox)).toBe(middle(copyrightBox));
  expect(middle(navBox)).toBe(middle(copyrightBox));
});

test("takes the year from the clock when it renders", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2031, 5, 1));
  const screen = await renderFooter();

  await expect
    .element(screen.getByRole("contentinfo"))
    .toHaveTextContent(/^© 2031 Durables/);
});

test("links to Terms, Privacy, Security and the durables-dev organization on GitHub, in that order", async () => {
  const screen = await renderFooter();

  const links = screen
    .getByRole("navigation", { name: "Footer" })
    .getByRole("link")
    .elements();
  expect(
    links.map((link) => [
      link.getAttribute("aria-label") ?? link.textContent,
      link.getAttribute("href"),
    ]),
  ).toEqual([
    ["Terms", "/terms"],
    ["Privacy", "/privacy"],
    ["Security", "/security"],
    ["Durables on GitHub", "https://github.com/durables-dev"],
  ]);
});

test("links Kisasa, in the credit, to its Temporal page", async () => {
  const screen = await renderFooter();

  const kisasa = screen
    .getByRole("contentinfo")
    .getByText(credit, { exact: true })
    .getByRole("link", { name: "Kisasa", exact: true });
  await expect
    .element(kisasa)
    .toHaveAttribute("href", "https://kisasa.io/temporal");
  // It opens in a new tab, so the visitor keeps their place on Durables.
  await expect.element(kisasa).toHaveAttribute("target", "_blank");
  await expect.element(kisasa).toHaveAttribute("rel", "noopener noreferrer");
});

test("shows GitHub as its mark, with the link named for screen readers", async () => {
  const screen = await renderFooter();

  const github = screen
    .getByRole("navigation", { name: "Footer" })
    .getByRole("link", { name: "Durables on GitHub", exact: true });
  await expect.element(github).toBeVisible();
  expect(github.element().textContent).toBe("");
  const mark = github.element().querySelector("svg");
  expect(mark?.getAttribute("aria-hidden")).toBe("true");
  const box = mark?.getBoundingClientRect();
  expect(box?.width).toBe(16);
  expect(box?.height).toBe(16);
});

describe.each([
  { name: "Terms", path: "/terms" },
  { name: "Privacy", path: "/privacy" },
  { name: "Security", path: "/security" },
])("the $name link", ({ name, path }) => {
  test(`takes a visitor to ${path}`, async () => {
    const screen = await openAt("/");

    await screen
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link", { name })
      .click();

    await expect
      .element(
        screen.getByRole("main").getByRole("heading", { level: 1, name }),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});

test("has no About or Contact link, no disclaimer and no official wording", async () => {
  const screen = await renderFooter();

  const footer = screen.getByRole("contentinfo");
  await expect.element(footer).toBeVisible();
  const text = footer.element().textContent;
  expect(text).toBe(`© ${year()} Durables${credit}TermsPrivacySecurity`);
  expect(text).not.toMatch(/about|contact|disclaim|official|affiliat/i);
  // The GitHub mark is the only picture.
  expect(footer.element().querySelectorAll("img, svg, picture")).toHaveLength(
    1,
  );
});

describe.each([
  { scheme: "dark", band: "#17120D", page: "#0B0806" },
  { scheme: "light", band: "#F1E8DD", page: "#FFFBF5" },
] as const)("under a $scheme colour scheme", ({ scheme, band, page }) => {
  test(`draws the footer band in the footer token, ${band}, with muted text`, async () => {
    await emulateColorScheme(scheme);
    const screen = await renderFooter();

    const footer = screen.getByRole("contentinfo");
    await expect.element(footer).toBeVisible();
    const style = getComputedStyle(footer.element());
    expect(style.backgroundColor).toBe(tokenColor("--footer"));
    expect(style.backgroundColor).toBe(hexColor(band));
    expect(getComputedStyle(document.body).backgroundColor).toBe(
      hexColor(page),
    );
    expect(style.color).toBe(tokenColor("--fg-muted"));
    for (const link of footer.getByRole("link").elements()) {
      expect(getComputedStyle(link).color).toBe(tokenColor("--fg-muted"));
    }
  });
});

test("stacks and centres on a narrow screen, with every link still visible", async () => {
  await page.viewport(320, 640);
  const screen = await renderFooter();

  const footer = screen.getByRole("contentinfo");
  await expect.element(footer).toBeVisible();

  const footerBox = footer.element().getBoundingClientRect();
  const copyrightBox = footer
    .getByText(/^© \d{4} Durables$/)
    .element()
    .getBoundingClientRect();
  const creditBox = footer
    .getByText(credit, { exact: true })
    .element()
    .getBoundingClientRect();
  const nav = footer.getByRole("navigation", { name: "Footer" });
  const navBox = nav.element().getBoundingClientRect();
  // Stacked: copyright, then credit, then links.
  expect(creditBox.top).toBeGreaterThanOrEqual(copyrightBox.bottom);
  expect(navBox.top).toBeGreaterThanOrEqual(creditBox.bottom);
  // Centred: each line has equal space on both sides.
  for (const box of [copyrightBox, creditBox, navBox]) {
    const left = box.left - footerBox.left;
    const right = footerBox.right - box.right;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  }
  for (const link of nav.getByRole("link").all()) {
    await expect.element(link).toBeVisible();
    const box = link.element().getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(320);
  }
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
});

test("each link takes keyboard focus in order and shows a visible focus ring", async () => {
  const screen = await renderFooter();

  const nav = screen.getByRole("navigation", { name: "Footer" });
  await expect.element(nav).toBeVisible();
  const footer = screen.getByRole("contentinfo");
  // Kisasa, in the credit, comes before the footer's own links.
  for (const name of [
    "Kisasa",
    "Terms",
    "Privacy",
    "Security",
    "Durables on GitHub",
  ]) {
    await userEvent.tab();
    const link = footer.getByRole("link", { name, exact: true });
    await expect.element(link).toHaveFocus();
    const style = getComputedStyle(link.element());
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineWidth).toBe("2px");
    expect(style.outlineColor).toBe(tokenColor("--focus"));
  }
});
