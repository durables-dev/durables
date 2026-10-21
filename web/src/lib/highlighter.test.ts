import { describe, expect, test, vi } from "vitest";
import {
  codeLanguage,
  createHighlighter,
  type CodeLanguage,
  type GrammarLoader,
} from "./highlighter";

const samples: Record<CodeLanguage, { code: string; keyword: string }> = {
  python: {
    code: "async def post_slack_message(msg: SlackMessage) -> MessageRef:\n\treturn 'ok'  # sent\n",
    keyword: "def",
  },
  typescript: {
    code: "export async function charge(input: Charge): Promise<Receipt> {\n  return { id: 'r1' };\n}\n",
    keyword: "function",
  },
  csharp: {
    code: "public class Activities\n{\n    [Activity]\n    public Task<string> Run(string input) => Task.FromResult(input);\n}\n",
    keyword: "public",
  },
};

function countingGrammars() {
  const calls: Record<CodeLanguage, GrammarLoader> = {
    python: vi.fn(() => import("shiki/langs/python.mjs")),
    typescript: vi.fn(() => import("shiki/langs/typescript.mjs")),
    csharp: vi.fn(() => import("shiki/langs/csharp.mjs")),
  };
  return calls;
}

describe.each(Object.keys(samples) as CodeLanguage[])("%s", (language) => {
  const { code, keyword } = samples[language];

  test("produces coloured tokens once its grammar has loaded", async () => {
    const highlighter = createHighlighter();

    await expect(highlighter.load(language)).resolves.toBe(true);
    const lines = highlighter.highlight(code, language);

    expect(lines).toBeDefined();
    const tokens = lines?.flat() ?? [];
    const keywordToken = tokens.find((token) => token.content === keyword);
    expect(keywordToken?.color).toBe("var(--code-token-keyword)");
    expect(tokens.filter((token) => token.color).length).toBeGreaterThan(2);
  });

  test("keeps every character, so each line's tokens rejoin to the line", async () => {
    const highlighter = createHighlighter();
    await highlighter.load(language);

    const lines = highlighter.highlight(code, language) ?? [];
    const rejoined = lines.map((line) => line.map((t) => t.content).join(""));

    expect(rejoined).toEqual(code.split("\n"));
  });
});

test("nothing is highlighted before a language's grammar has loaded", () => {
  const highlighter = createHighlighter(countingGrammars());

  expect(highlighter.isLoaded("python")).toBe(false);
  expect(highlighter.highlight("def f(): pass", "python")).toBeUndefined();
});

test("a grammar loads only when its language is first needed, and only once", async () => {
  const grammars = countingGrammars();
  const highlighter = createHighlighter(grammars);

  expect(grammars.python).not.toHaveBeenCalled();
  expect(grammars.typescript).not.toHaveBeenCalled();
  expect(grammars.csharp).not.toHaveBeenCalled();

  await highlighter.load("python");
  await highlighter.load("python");

  expect(grammars.python).toHaveBeenCalledTimes(1);
  expect(grammars.typescript).not.toHaveBeenCalled();
  expect(grammars.csharp).not.toHaveBeenCalled();
  expect(highlighter.isLoaded("python")).toBe(true);
  expect(highlighter.isLoaded("typescript")).toBe(false);
  expect(highlighter.highlight("let x = 1", "typescript")).toBeUndefined();
});

test("a grammar that fails to load leaves the language unhighlighted", async () => {
  const grammars = countingGrammars();
  grammars.csharp = () => Promise.reject(new Error("offline"));
  const highlighter = createHighlighter(grammars);

  await expect(highlighter.load("csharp")).resolves.toBe(false);
  expect(highlighter.isLoaded("csharp")).toBe(false);
  expect(highlighter.highlight("public class A {}", "csharp")).toBeUndefined();
});

test.each([
  ["python", "python"],
  ["TypeScript", "typescript"],
  ["csharp", "csharp"],
])("%s is a highlighted language", (name, expected) => {
  expect(codeLanguage(name)).toBe(expected);
});

test.each(["java", "go", "", undefined])(
  "%s is not a highlighted language",
  (name) => {
    expect(codeLanguage(name)).toBeUndefined();
  },
);
