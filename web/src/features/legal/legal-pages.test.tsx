import { routes } from "@/app/router";
import "@/styles/global.css";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";

const legalPages = [
  { path: "/terms", heading: "Terms", title: "Terms · Durables" },
  { path: "/privacy", heading: "Privacy", title: "Privacy · Durables" },
  { path: "/security", heading: "Security", title: "Security · Durables" },
] as const;

// The real route tree, opened at an address as if typed into the browser. The header reads
// the session, which the default MSW handler answers as an anonymous visitor. Any other
// request to the API would fail the test.
async function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
}

afterEach(async () => {
  await page.viewport(414, 896);
});

test("the three legal addresses are registered inside the page frame", () => {
  const [frame] = routes;
  const paths = frame?.children?.map((route) => route.path);

  expect(frame?.id).toBe("frame");
  expect(paths).toEqual(
    expect.arrayContaining(["/terms", "/privacy", "/security"]),
  );
});

describe.each(legalPages)("$path", ({ path, heading, title }) => {
  test(`shows the "${heading}" heading inside the header frame`, async () => {
    const screen = await openAt(path);

    const main = screen.getByRole("main");
    await expect
      .element(main.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    await expect.element(screen.getByRole("banner")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Durables home" }))
      .toBeVisible();
    await expect.element(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  test("shows when the text last changed, then the text, below the heading", async () => {
    const screen = await openAt(path);

    const headingLocator = screen.getByRole("heading", {
      level: 1,
      name: heading,
    });
    await expect.element(headingLocator).toBeVisible();
    const headingElement = headingLocator.element();
    const updated = screen.getByText(/^Last updated \d{1,2} \w+ \d{4}$/);
    await expect.element(updated).toBeVisible();

    const [, firstBody] = screen
      .getByRole("main")
      .element()
      .querySelectorAll("p");
    if (!firstBody) throw new Error("Expected text below the date");
    expect(
      headingElement.compareDocumentPosition(updated.element()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      updated.element().compareDocumentPosition(firstBody) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect.element(firstBody).toBeVisible();
  });

  test("shows no placeholder text", async () => {
    const screen = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    expect(
      screen.getByRole("note", { name: "Placeholder notice" }).elements(),
    ).toEqual([]);
    expect(screen.getByRole("main").element().textContent).not.toMatch(
      /placeholder|the final text/i,
    );
  });

  test("gives every contact address a mail link", async () => {
    const screen = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    const mailLinks = screen
      .getByRole("link", { name: /@durables\.dev$/ })
      .elements();
    expect(mailLinks.length).toBeGreaterThan(0);
    for (const link of mailLinks) {
      expect(link.getAttribute("href")).toBe(`mailto:${link.textContent}`);
    }
  });

  test(`sets the tab title to "${title}"`, async () => {
    const screen = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    await expect.poll(() => document.title).toBe(title);
  });

  test("is readable with no signed-in state and asks nobody to sign in", async () => {
    const screen = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    expect(screen.getByRole("link", { name: /sign in/i }).elements()).toEqual(
      [],
    );
    expect(screen.getByRole("button", { name: /sign in/i }).elements()).toEqual(
      [],
    );
  });

  test("keeps the text column inside a narrow viewport", async () => {
    await page.viewport(320, 640);
    const screen = await openAt(path);

    const article = screen.getByRole("article");
    await expect.element(article).toBeVisible();
    const box = article.element().getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(320);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  });
});

// Text with its runs of whitespace collapsed, as a reader sees it.
function tidy(text: string | null) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

// The Terms text, split at each second-level heading. Each section is its heading and the
// text of its blocks in order: every paragraph, and every list item on its own. The text
// before the first heading is the "Introduction".
async function termsSections() {
  const screen = await openAt("/terms");
  const publishing = screen.getByRole("heading", {
    level: 2,
    name: "Publishing",
  });
  await expect.element(publishing).toBeVisible();

  const body = publishing.element().parentElement;
  if (!body) throw new Error("Expected the Terms headings inside a body");
  const sections: { heading: string; blocks: string[] }[] = [
    { heading: "Introduction", blocks: [] },
  ];
  for (const child of Array.from(body.children)) {
    if (child.tagName === "H2") {
      sections.push({ heading: tidy(child.textContent), blocks: [] });
      continue;
    }
    const blocks =
      child.tagName === "UL"
        ? Array.from(child.querySelectorAll("li"))
        : [child];
    sections
      .at(-1)
      ?.blocks.push(...blocks.map((block) => tidy(block.textContent)));
  }
  return { screen, sections };
}

describe("/terms licence wording", () => {
  test("the Publishing section says everything is published under MIT-0", async () => {
    const { sections } = await termsSections();

    const publishing = sections.find(({ heading }) => heading === "Publishing");
    expect(publishing?.blocks).toContain(
      "publish it under MIT-0, like everything on Durables: anyone may use, change and share it, with no attribution and no warranty.",
    );
  });

  test('the page no longer says "unless the code states a licence"', async () => {
    const { screen } = await termsSections();

    const text = tidy(screen.getByRole("main").element().textContent);
    expect(text).not.toMatch(/unless the code states a licen[cs]e/i);
    expect(text).not.toMatch(/licen[cs]e of its own/i);
  });

  test("every other part of the Terms is unchanged", async () => {
    const { sections } = await termsSections();

    expect(sections).toEqual([
      {
        heading: "Introduction",
        blocks: [
          "Durables is a free community registry of Temporal activities. It is run by David Dieruf as an individual, not by a company, and it is not affiliated with or endorsed by Temporal Technologies. By using Durables, you agree to these terms.",
        ],
      },
      {
        heading: "Using the site",
        blocks: [
          "Anyone can browse, search and copy from Durables without an account. Please don't disrupt the site: no automated traffic that degrades it for others, no attempts to get around its limits, and no attempts to reach data that isn't yours.",
        ],
      },
      {
        heading: "Publishing",
        blocks: [
          "To publish, you sign in and choose a handle. When you publish, you:",
          "confirm you wrote the code, or have the right to share it under these terms;",
          "keep ownership of it;",
          "let Durables store, analyse, display and distribute it;",
          "publish it under MIT-0, like everything on Durables: anyone may use, change and share it, with no attribution and no warranty.",
          "Handles and published versions are permanent. A handle can never be changed or given to someone else, and a published version can't be edited or replaced; you publish a new version instead. Check your code before you publish, and never include secrets, keys or anyone's personal data.",
        ],
      },
      {
        heading: "What you can't publish",
        blocks: [
          "Malicious code, or code that hides what it does.",
          "Code you don't have the right to share.",
          "Secrets, credentials or other people's personal data.",
          "Anything that impersonates another person or project.",
          "Anything unlawful.",
          "Durables may hide or remove content, or suspend an account, that breaks these terms, without notice.",
        ],
      },
      {
        heading: "Using published code",
        blocks: [
          "Activities on Durables are written by the community. Durables never runs published code. Its checks are automated, read the code as text, and can be wrong. Review any code before you use it; you are responsible for what you run.",
        ],
      },
      {
        heading: "No warranty",
        blocks: [
          "Durables and everything on it are provided as is, without warranties of any kind. To the extent the law allows, the operator is not liable for any loss or damage arising from your use of the site or of code found on it. The site may change, pause or close at any time.",
        ],
      },
      {
        heading: "Changes",
        blocks: [
          "These terms may change. The date at the top shows when they last did. Continuing to use Durables after a change means you accept it.",
        ],
      },
      {
        heading: "Contact",
        blocks: ["Questions about these terms: hello@durables.dev."],
      },
    ]);
  });
});
