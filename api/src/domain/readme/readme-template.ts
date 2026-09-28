import type { ReadmeTemplate } from "../../model/listing.js";

// The one README template for every SDK. Every heading is required: publishing
// fails if one is missing or has nothing under it. Seed READMEs use the same headings.

const REQUIRED_HEADINGS = ["What it does", "Behavior", "Retry safety", "Permanent errors", "On timeout"];

const MARKDOWN = `## What it does

<!-- One or two sentences: what the activity does, and to which external system. -->

## Behavior

<!-- A line on how the activity behaves when things go wrong, then the three sections below. -->

### Retry safety

<!-- Is it safe for Temporal to retry this activity? Say how duplicates are prevented (for example an idempotency key). -->

### Permanent errors

<!-- Which errors are non-retryable, their error types, and when they are raised. -->

### On timeout

<!-- What has or hasn't happened in the external system if the activity times out, and what a retry does then. -->
`;

export const README_TEMPLATE: ReadmeTemplate = {
  markdown: MARKDOWN,
  requiredHeadings: REQUIRED_HEADINGS,
};

type Section = { heading: string; body: string };

/**
 * Returns the required headings that are missing from `readme`, or whose section
 * has no text of its own (HTML comments don't count). A heading's section runs
 * to the next heading of any level, so "Behavior" needs a line of its own above
 * its sub-headings.
 */
export function findMissingHeadings(readme: string): string[] {
  const sections = splitSections(readme);
  return REQUIRED_HEADINGS.filter((required) => {
    const section = sections.find((s) => normalize(s.heading) === normalize(required));
    return !section || stripComments(section.body).trim() === "";
  });
}

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      current = { heading: heading[1], body: "" };
      sections.push(current);
    } else if (current) {
      current.body += line + "\n";
    }
  }
  return sections;
}

function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?(-->|$)/g, "");
}

function normalize(heading: string): string {
  return heading.replace(/\s+/g, " ").trim().toLowerCase();
}
