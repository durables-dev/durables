import "@/styles/global.css";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PasteEditor } from "./paste-editor";
import { checkPauseMs } from "./use-check-request";

interface HarnessProps {
  initial?: string | undefined;
  checks: string[];
}

// The editor as a step would hold it: the code in state, every check request recorded. A
// button before it and a clipboard source after it stand in for the rest of the page.
function Harness({ initial = "", checks }: HarnessProps) {
  const [code, setCode] = useState(initial);
  return (
    <div style={{ width: "640px" }}>
      <button type="button">Before</button>
      <PasteEditor
        value={code}
        onChange={setCode}
        onCheck={(checked) => checks.push(checked)}
      />
      <label>
        Clipboard source
        <textarea />
      </label>
    </div>
  );
}

async function openEditor(initial?: string) {
  const checks: string[] = [];
  const screen = await render(<Harness initial={initial} checks={checks} />);
  const editor = screen.getByRole("textbox", { name: "Paste your file" });
  await expect.element(editor).toBeVisible();
  const element = editor.element() as HTMLTextAreaElement;
  return { screen, editor, element, checks };
}

type Screen = Awaited<ReturnType<typeof openEditor>>["screen"];

// The gutter is hidden from assistive technology, so no role or label reaches it. It is the
// column beside the editor.
function gutterOf(editor: HTMLTextAreaElement): HTMLElement {
  const gutter = editor.previousElementSibling;
  if (!(gutter instanceof HTMLElement)) throw new Error("No gutter");
  return gutter;
}

function gutterNumbers(editor: HTMLTextAreaElement): string[] {
  return (gutterOf(editor).textContent ?? "").split("\n");
}

function lineHeight(editor: HTMLTextAreaElement): number {
  return Number.parseFloat(getComputedStyle(editor).lineHeight);
}

// Puts text on the real clipboard by copying it from another field on the page.
async function copyToClipboard(screen: Screen, text: string) {
  const source = screen
    .getByRole("textbox", { name: "Clipboard source" })
    .element() as HTMLTextAreaElement;
  source.value = text;
  source.focus();
  source.select();
  await userEvent.copy();
}

async function paste(
  screen: Screen,
  editor: HTMLTextAreaElement,
  text: string,
) {
  await copyToClipboard(screen, text);
  editor.focus();
  await userEvent.paste();
}

function lines(count: number): string {
  return Array.from({ length: count }, (_, at) => `line ${at + 1}`).join("\n");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("the paste editor", () => {
  test("has the accessible name Paste your file", async () => {
    const { editor } = await openEditor();

    await expect.element(editor).toHaveAccessibleName("Paste your file");
  });

  test("reaches the editor with the keyboard alone, by its name", async () => {
    const { screen } = await openEditor();
    (
      screen.getByRole("button", { name: "Before" }).element() as HTMLElement
    ).focus();

    await userEvent.tab();

    const focused = document.activeElement;
    expect(focused).toBe(
      screen.getByRole("textbox", { name: "Paste your file" }).element(),
    );
  });

  test("an empty editor shows the placeholder and line 1", async () => {
    const { editor, element } = await openEditor();

    await expect
      .element(editor)
      .toHaveAttribute("placeholder", "Paste a single-file Temporal activity");
    expect(element.matches(":placeholder-shown")).toBe(true);
    expect(gutterNumbers(element)).toEqual(["1"]);
  });

  test("the gutter has one number per line, counting a trailing line break", async () => {
    const { element } = await openEditor("a\nb\nc\n");

    expect(gutterNumbers(element)).toEqual(["1", "2", "3", "4"]);
  });

  test("CRLF text has the same gutter count as LF text", async () => {
    const { element } = await openEditor("a\r\nb\r\n\r\nc");

    expect(gutterNumbers(element)).toEqual(["1", "2", "3", "4"]);
  });

  test("the gutter count follows typing", async () => {
    const { editor, element } = await openEditor();

    await userEvent.type(editor, "one{Enter}two{Enter}");

    expect(gutterNumbers(element)).toEqual(["1", "2", "3"]);
  });

  test("the gutter is hidden from assistive technology and can't be selected", async () => {
    const { element } = await openEditor("a\nb");
    const gutter = gutterOf(element);

    expect(gutter.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(gutter).userSelect).toBe("none");
  });

  test("pasted tabs stay tabs and display four spaces wide", async () => {
    const { screen, element } = await openEditor();
    const code = "def run():\n\treturn 1\n\t\tx\t= 2";

    await paste(screen, element, code);

    await expect.poll(() => element.value).toBe(code);
    expect(gutterNumbers(element)).toEqual(["1", "2", "3"]);
    expect(getComputedStyle(element).tabSize).toBe("4");

    // A run of tabs is exactly as wide as four spaces per tab.
    element.value = `${"\t".repeat(60)}x`;
    const tabbed = element.scrollWidth;
    element.value = `${" ".repeat(240)}x`;
    expect(element.scrollWidth).toBe(tabbed);
  });

  test("a paste keeps CRLF content and the gutter counts the same lines", async () => {
    const { screen, element } = await openEditor();

    await paste(screen, element, "a\r\nb\r\nc");

    await expect.poll(() => element.value.replaceAll("\r", "")).toBe("a\nb\nc");
    expect(gutterNumbers(element)).toHaveLength(3);
  });

  test("Tab types four spaces at the caret and keeps focus", async () => {
    const { editor, element } = await openEditor("ab");
    element.focus();
    element.setSelectionRange(1, 1);

    await userEvent.keyboard("{Tab}");

    await expect.element(editor).toHaveValue("a    b");
    expect(document.activeElement).toBe(element);
    expect(element.selectionStart).toBe(5);
    expect(element.selectionEnd).toBe(5);
  });

  test("Tab replaces a selection with four spaces", async () => {
    const { editor, element } = await openEditor("a-selected-b");
    element.focus();
    element.setSelectionRange(1, 11);

    await userEvent.keyboard("{Tab}");

    await expect.element(editor).toHaveValue("a    b");
    expect(document.activeElement).toBe(element);
  });

  test("a paste requests a check at once", async () => {
    const { screen, element, checks } = await openEditor();

    await paste(screen, element, "import temporalio");

    await expect.poll(() => checks).toEqual(["import temporalio"]);
  });

  test("a paste drops a wait already in progress from typing", async () => {
    const { screen, editor, element, checks } = await openEditor();
    await userEvent.type(editor, "x");

    await paste(screen, element, "y");

    await expect.poll(() => checks).toEqual(["xy"]);
    await wait(checkPauseMs + 300);
    expect(checks).toEqual(["xy"]);
  });

  test("typing then pausing 1.5 seconds requests one check", async () => {
    const { editor, checks } = await openEditor();

    await userEvent.type(editor, "abc");
    await wait(checkPauseMs - 500);
    expect(checks).toEqual([]);

    await expect.poll(() => checks, { timeout: 2000 }).toEqual(["abc"]);
    await wait(500);
    expect(checks).toEqual(["abc"]);
  });

  test("typing again before the pause ends restarts the wait", async () => {
    const { editor, checks } = await openEditor();

    await userEvent.type(editor, "a");
    await wait(checkPauseMs - 500);
    await userEvent.type(editor, "b");
    await wait(checkPauseMs - 500);
    expect(checks).toEqual([]);

    await expect.poll(() => checks, { timeout: 2000 }).toEqual(["ab"]);
  });

  test("Tab counts as typing and requests a check after the pause", async () => {
    const { element, checks } = await openEditor();
    element.focus();

    await userEvent.keyboard("{Tab}");
    expect(checks).toEqual([]);

    await expect.poll(() => checks, { timeout: 2500 }).toEqual(["    "]);
  });

  test("is at least 24 lines tall when empty", async () => {
    const { element } = await openEditor();

    expect(element.clientHeight).toBeGreaterThanOrEqual(
      24 * lineHeight(element),
    );
    expect(element.clientHeight).toBeLessThan(25 * lineHeight(element) + 24);
  });

  test("grows with the code without scrolling", async () => {
    const { element } = await openEditor(lines(32));

    expect(element.clientHeight).toBeGreaterThanOrEqual(
      32 * lineHeight(element),
    );
    expect(element.scrollHeight).toBeLessThanOrEqual(element.clientHeight);
  });

  test("stops growing at 40 lines and scrolls", async () => {
    const { element } = await openEditor(lines(120));

    expect(element.clientHeight).toBeGreaterThanOrEqual(
      40 * lineHeight(element),
    );
    expect(element.clientHeight).toBeLessThan(41 * lineHeight(element) + 24);
    expect(element.scrollHeight).toBeGreaterThan(element.clientHeight);
  });

  test("the gutter follows the editor's scroll", async () => {
    const { element } = await openEditor(lines(120));

    element.scrollTop = 400;

    await expect
      .poll(() => gutterOf(element).scrollTop)
      .toBe(element.scrollTop);
    expect(element.scrollTop).toBe(400);

    element.scrollTop = element.scrollHeight;

    await expect
      .poll(() => gutterOf(element).scrollTop)
      .toBe(element.scrollTop);
  });

  test("a gutter number sits on the same row as its line after scrolling", async () => {
    const { element } = await openEditor(lines(120));
    element.scrollTop = 730;
    expect(element.scrollTop).toBe(730);
    await expect.poll(() => gutterOf(element).scrollTop).toBe(730);

    const line = 60;
    const text = gutterOf(element).firstChild;
    if (!(text instanceof Text)) throw new Error("No gutter text");
    const start = (
      text.data
        .split("\n")
        .slice(0, line - 1)
        .join("\n") + "\n"
    ).length;
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + String(line).length);
    const numberTop = range.getBoundingClientRect().top;

    const box = element.getBoundingClientRect();
    const paddingTop = Number.parseFloat(getComputedStyle(element).paddingTop);
    const lineTop =
      box.top +
      paddingTop +
      (line - 1) * lineHeight(element) -
      element.scrollTop;
    const halfLeading =
      (lineHeight(element) - range.getBoundingClientRect().height) / 2;

    expect(Math.abs(numberTop - halfLeading - lineTop)).toBeLessThan(1.5);
  });

  test("a long line does not wrap and scrolls sideways without moving the gutter", async () => {
    const { element } = await openEditor(
      `short\n${"word ".repeat(120)}\nshort`,
    );
    const gutter = gutterOf(element);
    const before = gutter.getBoundingClientRect();

    expect(element.scrollWidth).toBeGreaterThan(element.clientWidth);
    expect(gutterNumbers(element)).toEqual(["1", "2", "3"]);

    element.scrollLeft = 500;
    await expect.poll(() => element.scrollLeft).toBeGreaterThan(0);

    const after = gutter.getBoundingClientRect();
    expect(after.left).toBe(before.left);
    expect(after.top).toBe(before.top);
    expect(gutter.scrollTop).toBe(0);
  });

  test("a long line takes one row", async () => {
    const { element } = await openEditor(
      `${"word ".repeat(120)}\n${lines(29)}`,
    );
    const padding =
      Number.parseFloat(getComputedStyle(element).paddingTop) +
      Number.parseFloat(getComputedStyle(element).paddingBottom);

    expect(gutterNumbers(element)).toHaveLength(30);
    expect(element.scrollWidth).toBeGreaterThan(element.clientWidth);
    // Thirty rows of text. Wrapping the long line would add about nine more.
    expect(element.scrollHeight).toBeLessThan(
      31 * lineHeight(element) + padding,
    );
  });
});
