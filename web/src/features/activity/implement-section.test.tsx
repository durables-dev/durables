import "@/styles/global.css";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ImplementSection } from "./implement-section";
import {
  dotnet,
  python,
  pythonCode,
  pythonWithoutEnvironment,
  typescript,
  type TestVersion,
} from "./test-versions";

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderImplement(version: TestVersion = python) {
  const screen = await render(
    <section>
      <ImplementSection version={version} sdk={version.sdk} />
    </section>,
  );
  await expect
    .element(screen.getByRole("heading", { level: 2, name: "Implement" }))
    .toBeVisible();
  return screen;
}

type Screen = Awaited<ReturnType<typeof renderImplement>>;

/** A code block's text and line numbers, read from its labelled region. */
async function codeBlock(screen: Screen, label: string) {
  const region = screen.getByRole("region", { name: label });
  await expect.element(region).toBeVisible();
  const element = region.element();
  return {
    text: element.querySelector("code")?.textContent,
    numbers: [...element.querySelectorAll('[aria-hidden="true"] > *')].map(
      (number) => number.textContent,
    ),
  };
}

const lineNumbers = (code: string) =>
  code.split("\n").map((_line, index) => String(index + 1));

test("the three steps are headed in order", async () => {
  const screen = await renderImplement();

  expect(
    screen
      .getByRole("heading", { level: 3 })
      .elements()
      .map((heading) => heading.textContent),
  ).toEqual([
    "1. Install the dependencies",
    "2. Add these four files to your project",
    "3. Run it",
  ]);
});

test("Python's install command is pip install temporalio, then a comment naming the modules", async () => {
  const screen = await renderImplement(python);

  const install = await codeBlock(screen, "install command");
  expect(install.text).toBe(
    "pip install temporalio\n# Also install the PyPI packages that provide: stripe",
  );
  expect(install.numbers).toEqual(["1", "2"]);
  await expect
    .element(screen.getByRole("button", { name: "Copy install command" }))
    .toBeVisible();
});

test(".NET's install command adds Temporalio, then a comment naming what else to add", async () => {
  const screen = await renderImplement(dotnet);

  const install = await codeBlock(screen, "install command");
  expect(install.text).toBe(dotnet.snippets[0]?.code);
  expect(install.text).toContain("dotnet add package Temporalio");
  expect(install.text?.split("\n").at(-1)).toBe(
    "# Also add the NuGet packages that provide: SixLabors.ImageSharp",
  );
  expect(install.numbers).toEqual(["1", "2", "3", "4"]);
});

test("TypeScript's install command names the packages in the command itself", async () => {
  const screen = await renderImplement(typescript);

  const install = await codeBlock(screen, "install command");
  expect(install.text).toBe(
    "npm install @temporalio/activity @temporalio/client @temporalio/worker @temporalio/workflow nodemailer",
  );
  expect(install.text).not.toContain("#");
  expect(install.numbers).toEqual(["1"]);
});

test.each([
  [python, ["activities.py", "workflows.py", "worker.py", "start.py"]],
  [typescript, ["activities.ts", "workflows.ts", "worker.ts", "start.ts"]],
  [
    dotnet,
    ["Activities.cs", "ResizeImageWorkflow.cs", "Program.cs", "Starter.cs"],
  ],
])(
  "$sdk shows four tabs named for the SDK, with the activity tab selected",
  async (version, names) => {
    const screen = await renderImplement(version);

    const tablist = screen.getByRole("tablist", { name: "Files" });
    await expect.element(tablist).toBeVisible();
    const tabs = tablist.getByRole("tab").elements();
    expect(tabs.map((tab) => tab.textContent)).toEqual(names);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    await expect
      .element(screen.getByRole("tabpanel", { name: names[0] ?? "" }))
      .toBeVisible();
  },
);

test("selecting each tab shows its file, its description line, line numbers and Copy", async () => {
  const screen = await renderImplement(python);
  const files = [
    [
      "activities.py",
      pythonCode,
      "The activity itself, exactly as published in ddieruf/charge-card@1.0.0.",
    ],
    [
      "workflows.py",
      python.snippets[1]?.code,
      "A minimal workflow that calls the activity.",
    ],
    [
      "worker.py",
      python.snippets[2]?.code,
      "Runs a worker that registers the workflow and the activity.",
    ],
    ["start.py", python.snippets[3]?.code, "Starts one run of the workflow."],
  ] as const;

  for (const [name, code, description] of [...files.slice(1), files[0]]) {
    const tab = screen.getByRole("tab", { name });
    await tab.click();

    await expect.element(tab).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name });
    await expect.element(panel.getByText(description)).toBeVisible();
    const block = await codeBlock(screen, name);
    expect(block.text).toBe(code);
    expect(block.numbers).toEqual(lineNumbers(code ?? ""));
    await expect
      .element(panel.getByRole("button", { name: `Copy ${name}` }))
      .toBeVisible();
    expect(
      screen
        .getByRole("tab", { selected: true })
        .elements()
        .map((selected) => selected.textContent),
    ).toEqual([name]);
  }
});

test("the activity tab shows the published code exactly, odd indentation, tabs and trailing spaces kept", async () => {
  const screen = await renderImplement(python);

  const activity = await codeBlock(screen, "activities.py");
  expect(activity.text).toBe(pythonCode);
  expect(activity.text).toContain("  key = os.environ['STRIPE_API_KEY']   \n");
  expect(activity.text).toContain("\treturn ChargeResult");
});

test("arrow keys, Home and End move between tabs, and only the selected tab is in the tab order", async () => {
  const screen = await renderImplement(python);

  const first = screen.getByRole("tab", { name: "activities.py" });
  await first.click();
  await userEvent.keyboard("{ArrowRight}");
  const second = screen.getByRole("tab", { name: "workflows.py" });
  await expect.element(second).toHaveAttribute("aria-selected", "true");
  await expect.element(second).toHaveFocus();

  await userEvent.keyboard("{End}");
  const last = screen.getByRole("tab", { name: "start.py" });
  await expect.element(last).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(first).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(last).toHaveFocus();
  await userEvent.keyboard("{Home}");
  await expect.element(first).toHaveFocus();

  expect(
    screen
      .getByRole("tab")
      .elements()
      .map((tab) => tab.tabIndex),
  ).toEqual([0, -1, -1, -1]);
});

test("the run commands show in a code block with line numbers", async () => {
  const screen = await renderImplement(python);

  const run = await codeBlock(screen, "run commands");
  expect(run.text).toBe(
    "temporal server start-dev\nexport STRIPE_API_KEY=...\npython worker.py\npython start.py",
  );
  expect(run.numbers).toEqual(["1", "2", "3", "4"]);
  await expect
    .element(screen.getByRole("button", { name: "Copy run commands" }))
    .toBeVisible();
});

test("the run commands still show when no environment variables were detected", async () => {
  const screen = await renderImplement(pythonWithoutEnvironment);

  await expect
    .element(screen.getByRole("heading", { level: 3, name: "3. Run it" }))
    .toBeVisible();
  const run = await codeBlock(screen, "run commands");
  expect(run.text).toBe(
    "temporal server start-dev\npython worker.py\npython start.py",
  );
  expect(run.numbers).toEqual(["1", "2", "3"]);
});

test.each([
  ["install command", python.snippets[0]?.code],
  ["activities.py", pythonCode],
  ["run commands", python.snippets[4]?.code],
])(
  'Copy on the %s block puts its text on the clipboard and shows "Copied"',
  async (label, code) => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    const screen = await renderImplement(python);

    await screen.getByRole("button", { name: `Copy ${label}` }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(code);
    const region = screen.getByRole("region", { name: label }).element();
    const status = region.parentElement?.querySelector('[role="status"]');
    expect(status?.textContent).toBe("Copied");
  },
);

test("Copy on a tab other than the activity's copies that file", async () => {
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue();
  const screen = await renderImplement(python);

  await screen.getByRole("tab", { name: "worker.py" }).click();
  await screen.getByRole("button", { name: "Copy worker.py" }).click();

  expect(writeText).toHaveBeenCalledExactlyOnceWith(python.snippets[2]?.code);
});
