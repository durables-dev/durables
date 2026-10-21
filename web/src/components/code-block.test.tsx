import "@/styles/global.css";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { createHighlighter, type GrammarLoader } from "@/lib/highlighter";
import { CodeBlock, COPY_FAILED_MESSAGE } from "./code-block";

const PYTHON = [
  "from temporalio import activity",
  "",
  "@activity.defn",
  "async def post_slack_message(msg: SlackMessage) -> MessageRef:",
  "\ttoken = os.environ['SLACK_TOKEN']   ",
  "\treturn await send(token, msg)",
  "",
].join("\n");

// Tangerine, the keyword colour, as the browser reports it.
const KEYWORD_RGB = "rgb(255, 90, 31)";

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderBlock(
  props: Partial<Parameters<typeof CodeBlock>[0]> = {},
) {
  const label = props.label ?? "activity source";
  const screen = await render(
    <div style={{ width: "480px" }}>
      <CodeBlock code={PYTHON} {...props} label={label} />
    </div>,
  );
  const region = screen.getByRole("region", { name: label });
  await expect.element(region).toBeVisible();
  const element = region.element();
  return {
    screen,
    region: element,
    code: () => element.querySelector("code")?.textContent,
    numbers: () =>
      [...element.querySelectorAll('[aria-hidden="true"] > *')].map(
        (number) => number.textContent,
      ),
    coloured: () => element.querySelectorAll("code span[style]").length,
  };
}

test("every line has a number, blank lines included", async () => {
  const block = await renderBlock({ code: "a\n\nb\n\n", language: "text" });

  expect(block.numbers()).toEqual(["1", "2", "3", "4", "5"]);
});

test("the text is exactly the input, tabs and trailing spaces included", async () => {
  const block = await renderBlock({ language: "text" });

  expect(block.code()).toBe(PYTHON);
  expect(block.numbers()).toHaveLength(PYTHON.split("\n").length);
});

test("highlighted code is still exactly the input", async () => {
  const block = await renderBlock({ language: "python" });

  await expect.poll(block.coloured).toBeGreaterThan(0);
  expect(block.code()).toBe(PYTHON);
});

test.each([
  ["python", PYTHON, "def"],
  [
    "typescript",
    "export async function charge(input: Charge): Promise<Receipt> {}",
    "function",
  ],
  [
    "csharp",
    "public class Activities\n{\n    public Task<string> Run(string input) => Task.FromResult(input);\n}",
    "class",
  ],
])(
  "%s tokens are coloured once the highlighter has loaded",
  async (language, code, keyword) => {
    const block = await renderBlock({ code, language });

    await expect.poll(block.coloured).toBeGreaterThan(0);
    const token = block.screen.getByText(keyword, { exact: true }).first();
    expect(getComputedStyle(token.element()).color).toBe(KEYWORD_RGB);
    expect(block.code()).toBe(code);
  },
);

test("an unknown language is plain text with line numbers", async () => {
  const block = await renderBlock({
    code: "fun main() {}\n",
    language: "kotlin",
  });

  expect(block.numbers()).toEqual(["1", "2"]);
  expect(block.code()).toBe("fun main() {}\n");
  expect(block.coloured()).toBe(0);
});

test("before the grammar loads, the code is plain with line numbers", async () => {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const python: GrammarLoader = async () => {
    await gate;
    return import("shiki/langs/python.mjs");
  };
  const highlighter = createHighlighter({
    python,
    typescript: () => import("shiki/langs/typescript.mjs"),
    csharp: () => import("shiki/langs/csharp.mjs"),
  });

  const block = await renderBlock({ language: "python", highlighter });

  expect(block.code()).toBe(PYTHON);
  expect(block.numbers()).toHaveLength(PYTHON.split("\n").length);
  expect(block.coloured()).toBe(0);

  release();
  await expect.poll(block.coloured).toBeGreaterThan(0);
  expect(block.code()).toBe(PYTHON);
});

test("empty code renders one numbered line", async () => {
  const block = await renderBlock({ code: "" });

  expect(block.numbers()).toEqual(["1"]);
  expect(block.code()).toBe("");
});

test("the copy button is named for what it copies", async () => {
  const { screen } = await renderBlock({ label: "install command" });

  await expect
    .element(screen.getByRole("button", { name: "Copy install command" }))
    .toBeVisible();
});

test("the status region is in the markup before anything is copied", async () => {
  const { screen } = await renderBlock();

  const status = screen.getByRole("status");
  await expect.element(status).toBeInTheDocument();
  await expect.element(status).toHaveTextContent("");
});

test('a copy the clipboard accepts announces "Copied" in the status region', async () => {
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  const { screen } = await renderBlock();

  await screen.getByRole("button", { name: "Copy activity source" }).click();

  await expect.element(screen.getByRole("status")).toHaveTextContent("Copied");
  expect(writeText).toHaveBeenCalledWith(PYTHON);
});

test("a copy the clipboard rejects shows a visible message", async () => {
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new DOMException("Denied", "NotAllowedError"),
  );
  const { screen } = await renderBlock();

  await screen.getByRole("button", { name: "Copy activity source" }).click();

  const message = screen.getByText(COPY_FAILED_MESSAGE);
  await expect.element(message).toBeVisible();
  await expect
    .element(screen.getByRole("status"))
    .not.toHaveTextContent("Copied");
});

test("tabs are kept and display four spaces wide", async () => {
  const block = await renderBlock({ code: "\tx\n    x", language: "text" });

  expect(block.code()).toBe("\tx\n    x");
  const [tabbed, spaced] = [
    ...block.region.querySelectorAll("code > span"),
  ].map((line) => {
    const range = document.createRange();
    range.selectNodeContents(line);
    return range.getBoundingClientRect().width;
  });
  expect(tabbed).toBeGreaterThan(0);
  expect(tabbed).toBe(spaced);
});

test("very long lines scroll sideways, and the gutter stays in view", async () => {
  const long = `x = "${"a".repeat(400)}"`;
  const block = await renderBlock({ code: long, language: "text" });

  expect(block.region.scrollWidth).toBeGreaterThan(block.region.clientWidth);
  expect(block.region.tabIndex).toBe(0);

  const gutter = block.region.querySelector('[aria-hidden="true"]');
  const before = gutter?.getBoundingClientRect().left;
  block.region.scrollLeft = 300;
  await expect.poll(() => block.region.scrollLeft).toBe(300);
  expect(gutter?.getBoundingClientRect().left).toBe(before);
  expect(block.code()).toBe(long);
});
