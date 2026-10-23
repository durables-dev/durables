import { describe, expect, it } from "vitest";
import { render } from "./render";

describe("render", () => {
  it("replaces a placeholder inside a line", () => {
    expect(render("from activities import {{name}}", { name: "x" })).toBe(
      "from activities import x",
    );
  });

  it("replaces every occurrence of a placeholder", () => {
    expect(render("{{a}} and {{a}}", { a: "b" })).toBe("b and b");
  });

  it("indents a block placeholder's value to match the placeholder", () => {
    expect(render("call(\n    {{lines}}\n)", { lines: "a,\nb," })).toBe(
      "call(\n    a,\n    b,\n)",
    );
  });

  it("removes the line of a block placeholder whose value is empty", () => {
    expect(render("first\n    {{optional}}\nlast", { optional: "" })).toBe(
      "first\nlast",
    );
  });

  it("keeps an empty line inside a block value empty, with no indentation", () => {
    expect(render("  {{block}}", { block: "a\n\nb" })).toBe("  a\n\n  b");
  });

  it("drops the template's final line break", () => {
    expect(render("one\ntwo\n", {})).toBe("one\ntwo");
  });

  it("reads a template with Windows line endings", () => {
    expect(render("one\r\n{{x}}\r\n", { x: "two" })).toBe("one\ntwo");
  });

  it("throws when a placeholder has no value", () => {
    expect(() => render("{{missing}}", {})).toThrow("{{missing}}");
  });

  it("throws when a placeholder inside a line is given several lines", () => {
    expect(() => render("x = {{value}}", { value: "a\nb" })).toThrow(
      "{{value}}",
    );
  });
});
