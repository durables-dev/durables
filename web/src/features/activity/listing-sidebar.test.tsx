import "@/styles/global.css";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { ListingSidebar, type ListingSidebarProps } from "./listing-sidebar";

const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

const chargeCard: ListingSidebarProps = {
  sdk: "Python",
  integrations: ["Stripe"],
  dependencies: ["stripe"],
  publishedAt: twoDaysAgo,
  handle: "ddieruf",
};

// The sidebar sits in a 300px column on the page, so the tests give it the same width.
function renderSidebar(props: Partial<ListingSidebarProps> = {}) {
  return render(
    <aside style={{ width: "300px" }}>
      <ListingSidebar {...chargeCard} {...props} />
    </aside>,
  );
}

/** The About card's rows, as [term, value] pairs in the order they show. */
function aboutRows(card: HTMLElement) {
  return [...card.querySelectorAll("dt")].map((term) => [
    term.textContent,
    term.nextElementSibling?.textContent,
  ]);
}

test("a version with integrations and dependencies shows all five About rows", async () => {
  const screen = await renderSidebar();

  const about = screen.getByRole("region", { name: "About" });
  await expect.element(about).toBeVisible();
  await expect
    .element(about.getByRole("heading", { level: 2, name: "About" }))
    .toBeVisible();
  expect(aboutRows(about.element() as HTMLElement)).toEqual([
    ["SDK", "Python, temporalio"],
    ["Integrates with", "Stripe"],
    ["Dependencies", "stripe"],
    ["Published", "2 days ago"],
    ["License", "MIT-0"],
  ]);
  expect(about.getByText("2 days ago").element().getAttribute("datetime")).toBe(
    twoDaysAgo,
  );
});

test("the SDK row names each SDK's package", async () => {
  for (const [sdk, name] of [
    ["Python", "Python, temporalio"],
    ["TypeScript", "TypeScript, @temporalio/activity"],
    [".NET", ".NET, Temporalio"],
  ] as const) {
    const screen = await renderSidebar({ sdk });
    const about = screen.getByRole("region", { name: "About" });
    expect(aboutRows(about.element() as HTMLElement)[0]).toEqual(["SDK", name]);
    await screen.unmount();
  }
});

test("several integrations and dependencies are listed in order, as plain text with no link", async () => {
  const screen = await renderSidebar({
    integrations: ["Stripe", "Slack"],
    dependencies: ["stripe", "slack_sdk"],
  });

  const about = screen.getByRole("region", { name: "About" });
  const rows = aboutRows(about.element() as HTMLElement);
  expect(rows).toContainEqual(["Integrates with", "Stripe, Slack"]);
  expect(rows).toContainEqual(["Dependencies", "stripe, slack_sdk"]);
  await expect.element(about.getByRole("link")).not.toBeInTheDocument();
});

test("a version with no integrations hides the Integrates with row", async () => {
  const screen = await renderSidebar({ integrations: [] });

  const about = screen.getByRole("region", { name: "About" });
  await expect.element(about).toBeVisible();
  await expect
    .element(about.getByText("Integrates with"))
    .not.toBeInTheDocument();
  expect(
    aboutRows(about.element() as HTMLElement).map(([term]) => term),
  ).toEqual(["SDK", "Dependencies", "Published", "License"]);
});

test('a version with no dependencies says "None beyond the SDK"', async () => {
  const screen = await renderSidebar({ dependencies: [] });

  const about = screen.getByRole("region", { name: "About" });
  expect(aboutRows(about.element() as HTMLElement)).toContainEqual([
    "Dependencies",
    "None beyond the SDK",
  ]);
  expect(
    aboutRows(about.element() as HTMLElement).map(([term]) => term),
  ).toEqual(["SDK", "Integrates with", "Dependencies", "Published", "License"]);
});

test('with no integrations and no dependencies, the row is hidden and Dependencies says "None beyond the SDK"', async () => {
  const screen = await renderSidebar({ integrations: [], dependencies: [] });

  const about = screen.getByRole("region", { name: "About" });
  await expect.element(about).toBeVisible();
  expect(aboutRows(about.element() as HTMLElement)).toEqual([
    ["SDK", "Python, temporalio"],
    ["Dependencies", "None beyond the SDK"],
    ["Published", "2 days ago"],
    ["License", "MIT-0"],
  ]);
});

test("a long dependency list wraps inside the card", async () => {
  const dependencies = Array.from(
    { length: 14 },
    (_, i) => `a_rather_long_package_name_${String(i)}`,
  );
  const screen = await renderSidebar({ dependencies });

  const about = screen.getByRole("region", { name: "About" });
  const value = about.getByText(dependencies.join(", "));
  await expect.element(value).toBeVisible();
  const card = about.element().getBoundingClientRect();
  const box = value.element().getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(card.left);
  expect(box.right).toBeLessThanOrEqual(card.right);
  expect(about.element().scrollWidth).toBeLessThanOrEqual(
    about.element().clientWidth,
  );
  // More than one line: the value is taller than the License row's single line.
  const license = about.getByText("MIT-0").element().getBoundingClientRect();
  expect(box.height).toBeGreaterThan(license.height * 2);
});

test("the Publisher card shows the initial in a circle and the handle as plain text, with no link", async () => {
  const screen = await renderSidebar();

  const publisher = screen.getByRole("region", { name: "Publisher" });
  await expect
    .element(publisher.getByRole("heading", { level: 2, name: "Publisher" }))
    .toBeVisible();
  const handle = publisher.getByText("ddieruf", { exact: true });
  await expect.element(handle).toBeVisible();
  const initial = handle.element().previousElementSibling;
  expect(initial).toBeInstanceOf(HTMLElement);
  if (!(initial instanceof HTMLElement)) return;
  expect(initial.getAttribute("aria-hidden")).toBe("true");
  expect(initial.textContent).toBe("D");
  const circle = initial.getBoundingClientRect();
  expect(circle.width).toBe(circle.height);
  expect(getComputedStyle(initial).borderRadius).not.toBe("0px");
  expect(handle.element().closest("a")).toBeNull();
  await expect.element(publisher.getByRole("link")).not.toBeInTheDocument();
  await expect
    .element(screen.getByText(/search all activities/i))
    .not.toBeInTheDocument();
});

test("the no-review note shows under the cards", async () => {
  const screen = await renderSidebar();

  const note = screen.getByText(
    "Durables doesn't review published code. You are responsible for what you run.",
    { exact: true },
  );
  await expect.element(note).toBeVisible();
  const publisher = screen
    .getByRole("region", { name: "Publisher" })
    .element()
    .getBoundingClientRect();
  expect(note.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(
    publisher.bottom,
  );
});

test("the sidebar has no Report this activity link and no Provenance card", async () => {
  const screen = await renderSidebar();

  await expect
    .element(screen.getByRole("region", { name: "About" }))
    .toBeVisible();
  await expect.element(screen.getByText(/report/i)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/provenance/i)).not.toBeInTheDocument();
  await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  expect(
    screen
      .getByRole("heading")
      .elements()
      .map((heading) => heading.textContent),
  ).toEqual(["About", "Publisher"]);
});
