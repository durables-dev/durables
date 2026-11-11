import "@/styles/global.css";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import {
  ConfigureSection,
  type ConfigureSectionProps,
} from "./configure-section";

const chargeCard: ConfigureSectionProps = {
  environmentVariables: ["STRIPE_API_KEY"],
  input: "ChargeRequest",
  output: "ChargeResult",
  runsAs: "sync",
  sdk: "Python",
};

function renderConfigure(props: Partial<ConfigureSectionProps> = {}) {
  return render(<ConfigureSection {...chargeCard} {...props} />);
}

const columnHeadings = /required|purpose/i;
const optionsText =
  /options|already filled in|start_to_close|timeout|maximum_attempts|retry/i;

test("detected environment variables are listed by name, with no Required or Purpose column and no line link", async () => {
  const screen = await renderConfigure({
    environmentVariables: ["STRIPE_API_KEY", "STRIPE_ACCOUNT"],
  });

  const list = screen.getByRole("list", { name: "Environment variables" });
  await expect.element(list).toBeVisible();
  expect(
    list
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent),
  ).toEqual(["STRIPE_API_KEY", "STRIPE_ACCOUNT"]);
  await expect
    .element(screen.getByText(columnHeadings))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole("table")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("columnheader"))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
  await expect.element(screen.getByText(/line \d+/i)).not.toBeInTheDocument();
});

test("many environment variables still list one per line", async () => {
  const names = Array.from({ length: 12 }, (_, i) => `SETTING_${String(i)}`);
  const screen = await renderConfigure({ environmentVariables: names });

  const items = screen
    .getByRole("list", { name: "Environment variables" })
    .getByRole("listitem")
    .elements();
  expect(items.map((item) => item.textContent)).toEqual(names);
  const tops = items.map((item) => item.getBoundingClientRect().top);
  for (let i = 1; i < tops.length; i += 1) {
    expect(tops[i]).toBeGreaterThan(tops[i - 1] ?? Infinity);
  }
  const lefts = new Set(items.map((item) => item.getBoundingClientRect().left));
  expect(lefts.size).toBe(1);
});

test('code that reads no environment variables shows the "no environment variables found" line', async () => {
  const screen = await renderConfigure({ environmentVariables: [] });

  await expect
    .element(screen.getByText("No environment variables found in the code."))
    .toBeVisible();
  await expect
    .element(screen.getByRole("list", { name: "Environment variables" }))
    .not.toBeInTheDocument();
});

test("both types read show two cards side by side, with the type names only", async () => {
  const screen = await renderConfigure();

  await expect
    .element(
      screen.getByRole("heading", { level: 3, name: "Input and output" }),
    )
    .toBeVisible();
  const cards = screen
    .getByRole("list", { name: "Input and output types" })
    .getByRole("listitem")
    .elements();
  expect(cards.map((card) => card.textContent)).toEqual([
    "InputChargeRequest",
    "OutputChargeResult",
  ]);
  const [input, output] = cards.map((card) => card.getBoundingClientRect());
  expect(input?.top).toBe(output?.top);
  expect(output?.left).toBeGreaterThanOrEqual(input?.right ?? Infinity);
  await expect
    .element(screen.getByText(/couldn.t be read/))
    .not.toBeInTheDocument();
});

test.each([
  {
    unread: "input",
    props: { input: null },
    still: "ChargeResult",
  },
  {
    unread: "output",
    props: { output: null },
    still: "ChargeRequest",
  },
] as const)(
  "an unreadable $unread type says so on its card",
  async ({ unread, props, still }) => {
    const screen = await renderConfigure(props);

    const cards = screen.getByRole("list", { name: "Input and output types" });
    await expect
      .element(
        cards.getByText(`The ${unread} type couldn't be read from the code.`),
      )
      .toBeVisible();
    await expect.element(cards.getByText(still)).toBeVisible();
    expect(cards.getByRole("listitem").elements()).toHaveLength(2);
  },
);

test('both types unreadable show two "couldn\'t be read" cards', async () => {
  const screen = await renderConfigure({ input: null, output: null });

  const cards = screen
    .getByRole("list", { name: "Input and output types" })
    .getByRole("listitem");
  expect(cards.elements()).toHaveLength(2);
  await expect
    .element(cards.getByText("The input type couldn't be read from the code."))
    .toBeVisible();
  await expect
    .element(cards.getByText("The output type couldn't be read from the code."))
    .toBeVisible();
});

test("a synchronous activity's worker requirements mention the thread pool the worker file sets up", async () => {
  const screen = await renderConfigure({ runsAs: "sync", sdk: "Python" });

  await expect
    .element(
      screen.getByRole("heading", { level: 3, name: "Worker requirements" }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "This is a synchronous activity. Your worker needs a thread pool to run it, which the worker file in Implement already sets up.",
      ),
    )
    .toBeVisible();
});

test("a synchronous .NET activity's worker requirements say the SDK runs it, with no thread pool", async () => {
  const screen = await renderConfigure({ runsAs: "sync", sdk: ".NET" });

  await expect
    .element(
      screen.getByRole("heading", { level: 3, name: "Worker requirements" }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "This is a synchronous activity. The .NET SDK runs it for you, so your worker needs no special setup.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText(/thread pool/)).not.toBeInTheDocument();
});

test("an async activity's worker requirements say no special setup is needed", async () => {
  const screen = await renderConfigure({ runsAs: "async" });

  await expect
    .element(
      screen.getByRole("heading", { level: 3, name: "Worker requirements" }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "This is an async activity. Your worker needs no special setup to run it.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText(/thread pool/)).not.toBeInTheDocument();
});

test("when the run mode couldn't be read, the worker requirements section is hidden", async () => {
  const screen = await renderConfigure({ runsAs: null });

  await expect
    .element(screen.getByRole("heading", { level: 2, name: "Configure" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Worker requirements" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByText(/thread pool|special setup/))
    .not.toBeInTheDocument();
});

test.each(["sync", "async", null] as const)(
  'Configure shows no activity options table and no "already filled in" line (runs as %s)',
  async (runsAs) => {
    const screen = await renderConfigure({ runsAs });

    await expect
      .element(screen.getByRole("heading", { level: 2, name: "Configure" }))
      .toBeVisible();
    await expect.element(screen.getByRole("table")).not.toBeInTheDocument();
    await expect.element(screen.getByText(optionsText)).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", { level: 3 })
        .elements()
        .map((heading) => heading.textContent),
    ).toEqual(
      runsAs === null
        ? ["Environment variables", "Input and output"]
        : ["Environment variables", "Input and output", "Worker requirements"],
    );
  },
);
