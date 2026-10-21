import "@/styles/global.css";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MIN_ROWS, PasteEditor } from "./paste-editor";
import { CHECK_PAUSE_MS } from "./use-check-request";

const PYTHON = [
  "from temporalio import activity",
  "",
  "@activity.defn",
  "async def post_slack_message(msg: SlackMessage) -> MessageRef:",
  "\ttoken = os.environ['SLACK_TOKEN']",
  "\tif not token:",
  "\t\traise ApplicationError('no token', non_retryable=True)",
  "\treturn await send(token, msg)",
  "",
].join("\n");

interface Check {
  code: string;
  at: number;
}

interface Change {
  code: string;
  at: number;
}

interface HarnessProps {
  initial: string;
  changes: Change[];
  checks: Check[];
}

// Holds the code the way the Code step's draft will, and records what the editor reports.
function Harness({ initial, changes, checks }: HarnessProps) {
  const [code, setCode] = useState(initial);
  return (
    <div style={{ width: "560px" }}>
      <PasteEditor
        value={code}
        onChange={(next) => {
          changes.push({ code: next, at: performance.now() });
          setCode(next);
        }}
        onCheck={(checked) => {
          checks.push({ code: checked, at: performance.now() });
        }}
      />
    </div>
  );
}

async function renderEditor(initial = "", { withSource = "" } = {}) {
  const changes: Change[] = [];
  const checks: Check[] = [];
  const screen = await render(
    <>
      {withSource && <textarea aria-label="Source" defaultValue={withSource} />}
      <Harness initial={initial} changes={changes} checks={checks} />
    </>,
  );
  const editor = screen.getByLabelText("Paste your file");
  await expect.element(editor).toBeVisible();
  const field = editor.element() as HTMLTextAreaElement;
  const gutter = field.parentElement?.querySelector<HTMLElement>(
    '[aria-hidden="true"]',
  );
  if (!gutter) throw new Error("The editor has no gutter.");
  return {
    screen,
    editor,
    field,
    gutter,
    changes,
    checks,
    numbers: () => gutter.textContent.split("\n"),
  };
}

async function emulateColorScheme(value: "light" | "dark" | "") {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value }],
  });
}

afterEach(async () => {
  await emulateColorScheme("");
});

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pastes through the browser's real clipboard: select the source text, copy, then paste
// into the editor.
async function paste(
  source: HTMLTextAreaElement,
  editor: Parameters<typeof userEvent.click>[0],
) {
  source.focus();
  source.select();
  await userEvent.copy();
  await userEvent.click(editor);
  await userEvent.paste();
}

test('has the accessible name "Paste your file"', async () => {
  const { screen, field } = await renderEditor();

  await expect
    .element(screen.getByRole("textbox", { name: "Paste your file" }))
    .toBeVisible();
  expect(field.tagName).toBe("TEXTAREA");
});

test('reaches the editor with the keyboard alone, named "Paste your file"', async () => {
  const { screen } = await renderEditor();

  await userEvent.tab();

  await expect
    .element(screen.getByRole("textbox", { name: "Paste your file" }))
    .toHaveFocus();
});

test("an empty editor shows the placeholder and line 1", async () => {
  const { editor, numbers } = await renderEditor();

  await expect
    .element(editor)
    .toHaveAttribute("placeholder", "Paste a single-file Temporal activity");
  expect(editor.element().matches(":placeholder-shown")).toBe(true);
  expect(numbers()).toEqual(["1"]);
});

test("the gutter has a number for every line, a trailing newline included", async () => {
  const { numbers } = await renderEditor("a\n\nb\n");

  expect(numbers()).toEqual(["1", "2", "3", "4"]);
});

test("is 24 lines tall when the code is shorter", async () => {
  const { field } = await renderEditor("one line");
  const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight);

  expect(field.rows).toBe(MIN_ROWS);
  expect(field.clientHeight).toBeGreaterThanOrEqual(lineHeight * MIN_ROWS);
});

test("grows with the code past 24 lines", async () => {
  const { field } = await renderEditor(Array(30).fill("x").join("\n"));
  const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight);

  expect(field.clientHeight).toBeGreaterThanOrEqual(lineHeight * 30);
  expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight + 1);
});

test("stops growing at its maximum height and scrolls", async () => {
  const { field } = await renderEditor(Array(300).fill("x").join("\n"));
  const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight);

  expect(field.clientHeight).toBeLessThan(lineHeight * 50);
  expect(field.scrollHeight).toBeGreaterThan(field.clientHeight);
});

test("the gutter takes the editor's height", async () => {
  const { field, gutter } = await renderEditor(Array(300).fill("x").join("\n"));

  expect(gutter.getBoundingClientRect().height).toBeCloseTo(
    field.getBoundingClientRect().height,
    0,
  );
});

test("the gutter follows the editor's scroll, all the way to the last line", async () => {
  const code = Array.from({ length: 200 }, (_, at) =>
    at === 150 ? "x".repeat(400) : `line ${at + 1}`,
  ).join("\n");
  const { field, gutter } = await renderEditor(code);

  field.scrollTop = 900;
  await expect.poll(() => gutter.scrollTop).toBe(field.scrollTop);

  field.scrollTop = field.scrollHeight;
  await expect.poll(() => gutter.scrollTop).toBe(field.scrollTop);
  expect(field.scrollTop).toBeGreaterThan(900);
});

test("a gutter number sits on the same row as its line after scrolling", async () => {
  const code = Array.from({ length: 200 }, (_, at) => `line ${at + 1}`).join(
    "\n",
  );
  const { field, gutter } = await renderEditor(code);
  const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight);

  field.scrollTop = lineHeight * 120;
  await expect.poll(() => gutter.scrollTop).toBe(field.scrollTop);

  // The first visible row of each holds the same line number.
  const firstGutterRow = Math.round(gutter.scrollTop / lineHeight) + 1;
  const firstCodeRow = Math.round(field.scrollTop / lineHeight) + 1;
  expect(firstGutterRow).toBe(firstCodeRow);
  expect(firstGutterRow).toBe(121);
});

test("a long line scrolls sideways without wrapping or moving the gutter", async () => {
  const { field, gutter, numbers } = await renderEditor(
    `short\n${"y".repeat(600)}\nend`,
  );
  const before = gutter.getBoundingClientRect();

  expect(field.scrollWidth).toBeGreaterThan(field.clientWidth);
  expect(numbers()).toEqual(["1", "2", "3"]);

  field.scrollLeft = 400;
  await expect.poll(() => field.scrollLeft).toBe(400);
  const after = gutter.getBoundingClientRect();
  expect(after.left).toBe(before.left);
  expect(gutter.scrollLeft).toBe(0);
  expect(gutter.textContent).toBe("1\n2\n3");
});

test("pasted tabs stay tabs and display four spaces wide", async () => {
  const { screen, field, editor, changes } = await renderEditor("", {
    withSource: PYTHON,
  });
  const source = screen
    .getByLabelText("Source")
    .element() as HTMLTextAreaElement;

  await paste(source, editor);

  await expect.element(editor).toHaveValue(PYTHON);
  expect(changes.at(-1)?.code).toBe(PYTHON);
  expect(field.value).toContain("\t\traise");
  expect(getComputedStyle(field).tabSize).toBe("4");
});

test("pasting CRLF text keeps its content and the gutter counts its lines", async () => {
  const crlf = PYTHON.replaceAll("\n", "\r\n");
  const { screen, field, editor, numbers } = await renderEditor("", {
    withSource: crlf,
  });
  const source = screen
    .getByLabelText("Source")
    .element() as HTMLTextAreaElement;

  await paste(source, editor);

  await expect.poll(() => field.value.length).toBeGreaterThan(0);
  expect(field.value.split(/\r\n|\r|\n/)).toEqual(PYTHON.split("\n"));
  expect(numbers()).toHaveLength(PYTHON.split("\n").length);
});

test("a paste requests a check at once", async () => {
  const { screen, editor, changes, checks } = await renderEditor("", {
    withSource: PYTHON,
  });
  const source = screen
    .getByLabelText("Source")
    .element() as HTMLTextAreaElement;

  await paste(source, editor);

  await expect.poll(() => checks.length).toBe(1);
  expect(checks[0]?.code).toBe(PYTHON);
  const pastedAt = changes.at(-1)?.at ?? 0;
  expect((checks[0]?.at ?? 0) - pastedAt).toBeLessThan(100);
});

test("Tab types four spaces at the caret and keeps focus", async () => {
  const { editor, field, checks } = await renderEditor("ab");

  await userEvent.click(editor);
  field.setSelectionRange(1, 1);
  await userEvent.keyboard("{Tab}");

  await expect.element(editor).toHaveValue("a    b");
  await expect.element(editor).toHaveFocus();
  expect(field.selectionStart).toBe(5);
  expect(field.selectionEnd).toBe(5);
  await userEvent.keyboard("c");
  await expect.element(editor).toHaveValue("a    cb");
  expect(checks).toHaveLength(0);
});

test("Tab replaces a selection with four spaces", async () => {
  const { editor, field } = await renderEditor("abcd");

  await userEvent.click(editor);
  field.setSelectionRange(1, 3);
  await userEvent.keyboard("{Tab}");

  await expect.element(editor).toHaveValue("a    d");
  await expect.element(editor).toHaveFocus();
  expect(field.selectionStart).toBe(5);
});

test("Shift+Tab leaves the code alone and moves focus back out", async () => {
  const { screen, editor } = await renderEditor("ab", { withSource: "x" });

  await userEvent.click(editor);
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");

  await expect.element(editor).toHaveValue("ab");
  await expect.element(screen.getByLabelText("Source")).toHaveFocus();
});

test("typing then pausing 1.5 seconds requests one check", async () => {
  const { editor, changes, checks } = await renderEditor();

  await userEvent.type(editor, "abc");
  await wait(CHECK_PAUSE_MS - 700);
  expect(checks).toHaveLength(0);

  await expect.poll(() => checks.length, { timeout: 3000 }).toBe(1);
  await wait(500);
  expect(checks).toHaveLength(1);
  expect(checks[0]?.code).toBe("abc");
  const lastChange = changes.at(-1)?.at ?? 0;
  expect((checks[0]?.at ?? 0) - lastChange).toBeGreaterThanOrEqual(
    CHECK_PAUSE_MS - 5,
  );
});

test("typing again before the pause ends restarts the wait", async () => {
  const { editor, changes, checks } = await renderEditor();

  await userEvent.type(editor, "a");
  const firstChange = changes.at(-1)?.at ?? 0;
  await wait(1000);
  await userEvent.type(editor, "b");
  await wait(1000);
  expect(checks).toHaveLength(0);

  await expect.poll(() => checks.length, { timeout: 3000 }).toBe(1);
  await wait(500);
  expect(checks).toHaveLength(1);
  expect(checks[0]?.code).toBe("ab");
  const lastChange = changes.at(-1)?.at ?? 0;
  expect((checks[0]?.at ?? 0) - lastChange).toBeGreaterThanOrEqual(
    CHECK_PAUSE_MS - 5,
  );
  expect((checks[0]?.at ?? 0) - firstChange).toBeGreaterThan(
    CHECK_PAUSE_MS + 900,
  );
});

test("the gutter cannot be selected and is hidden from assistive tech", async () => {
  const { gutter } = await renderEditor(PYTHON);

  expect(gutter.getAttribute("aria-hidden")).toBe("true");
  expect(getComputedStyle(gutter).userSelect).toBe("none");
});

test("the code panel is monospace and dark", async () => {
  const { field, gutter } = await renderEditor(PYTHON);
  const panel = field.parentElement;
  if (!panel) throw new Error("The editor has no panel.");

  expect(getComputedStyle(field).fontFamily).toContain("IBM Plex Mono");
  expect(getComputedStyle(gutter).fontFamily).toContain("IBM Plex Mono");
  expect(getComputedStyle(panel).backgroundColor).toBe("rgb(11, 8, 6)");
  expect(getComputedStyle(field).whiteSpace).toBe("pre");
});

test.each([
  ["dark", "rgb(255, 251, 245)"],
  ["light", "rgb(11, 8, 6)"],
] as const)(
  "under the %s theme the panel stays dark and the label follows the page",
  async (scheme, labelColour) => {
    await emulateColorScheme(scheme);
    const { screen, field } = await renderEditor(PYTHON);
    const panel = field.parentElement;
    if (!panel) throw new Error("The editor has no panel.");
    const label = screen.getByText("Paste your file").element();

    expect(getComputedStyle(panel).backgroundColor).toBe("rgb(11, 8, 6)");
    expect(getComputedStyle(field).color).toBe("rgb(255, 251, 245)");
    expect(getComputedStyle(label).color).toBe(labelColour);
  },
);
