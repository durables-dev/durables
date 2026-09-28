import { describe, expect, it } from "vitest";
import { findMissingHeadings, README_TEMPLATE } from "./readme-template.js";

describe("findMissingHeadings", () => {
  it("lists every heading of the untouched template, because its hints don't count", () => {
    expect(findMissingHeadings(README_TEMPLATE.markdown)).toEqual(README_TEMPLATE.requiredHeadings);
  });

  it("accepts a filled-in template", () => {
    const filled = README_TEMPLATE.markdown.replace(/<!--[^>]*-->/g, "Some text.");
    expect(findMissingHeadings(filled)).toEqual([]);
  });

  it("names a missing heading and an empty one", () => {
    const readme = "## What it does\nCharges.\n## Behavior\nFine.\n### Retry safety\n\n### Permanent errors\nCardDeclined.\n";
    expect(findMissingHeadings(readme)).toEqual(["Retry safety", "On timeout"]);
  });

  it("every required heading appears in the template markdown exactly as listed", () => {
    for (const heading of README_TEMPLATE.requiredHeadings) {
      expect(README_TEMPLATE.markdown).toMatch(new RegExp(`^#+ ${heading}$`, "m"));
    }
  });
});
