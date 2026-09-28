// The Python group file (POC-6 API map, "The Python group file"). The editor's
// text is parsed into segments, the service resolves each address, and the
// file is rendered again from the resolved members. The text between markers
// is never trusted: every block and the imports header are regenerated.
// Pure functions, no I/O.

import type { ActivityVersion } from "../../model/activity-version.js";
import type { Check } from "../../model/check.js";
import type { GroupMember, GroupProblem, GroupProblemKind, LineRange, ResolvedGroup } from "../../model/group-version.js";
import type { Sdk } from "../../model/detection.js";
import { formatActivityAddress, parseActivityAddress, type ActivityAddress } from "../addresses/address.js";
import { liftImports, mergeImports } from "./python-imports.js";

export const IMPORTS_START = "# ── imports, merged by durables.dev ──";
export const IMPORTS_END = "# ── end imports ──";
const BLOCK_START = /^# ── (durables\.dev\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*@\d+\.\d+\.\d+) ──$/;

const blockStart = (address: string) => `# ── ${address} ──`;
const blockEnd = (address: string) => `# ── end ${address} ──`;

/** One piece of the editor's text. */
export type GroupSegment =
  | { kind: "imports" }
  /** A resolved block, found by its markers. `address` is the pinned address its marker carries. */
  | { kind: "block"; address: ActivityAddress; text: string }
  /** A line that is a complete activity address, not yet resolved. */
  | { kind: "address"; address: ActivityAddress; text: string }
  /** Anything else: kept where it is, and editable. */
  | { kind: "text"; text: string };

export type Publisher = { handle: string; displayName: string; verified: boolean };

/** What the service found for a block or address segment. */
export type Resolution =
  | { ok: true; doc: ActivityVersion; publisher: Publisher }
  | { ok: false; kind: Exclude<GroupProblemKind, "name-collision">; message: string };

/** ResolvedGroup, plus what publishing needs to know that the editor doesn't. */
export type RenderedGroup = ResolvedGroup & {
  /** Lines of `file` that are neither blank, nor in a block, nor an address with a problem. */
  strayLines: number[];
};

export function parseGroupSource(source: string): GroupSegment[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const segments: GroupSegment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === IMPORTS_START) {
      const end = lines.indexOf(IMPORTS_END, i + 1);
      if (end !== -1) {
        segments.push({ kind: "imports" });
        i = end;
        continue;
      }
    }

    const start = BLOCK_START.exec(line);
    if (start) {
      const end = lines.indexOf(blockEnd(start[1]), i + 1);
      const address = parseActivityAddress(start[1]);
      if (end !== -1 && address) {
        segments.push({ kind: "block", address, text: start[1] });
        i = end;
        continue;
      }
    }

    const address = parseActivityAddress(line);
    if (address) {
      segments.push({ kind: "address", address, text: line });
      continue;
    }

    segments.push({ kind: "text", text: line });
  }

  return segments;
}

type Block = { doc: ActivityVersion; publisher: Publisher };

type BodyLine = {
  text: string;
  problem?: { kind: GroupProblemKind; message: string };
  /** Non-blank text that is neither a block nor an address. */
  stray?: boolean;
  /** Set on a block's opening and closing marker lines. */
  marker?: { block: Block; end: boolean };
};

/**
 * Renders the group file from the parsed segments and their resolutions
 * (`resolutions[i]` for `segments[i]`, for every block and address segment).
 *
 * Layout: the merged-imports header at the top, then two blank lines. A block
 * resolved from an address in this pass gets at least two blank lines on each
 * side. Blank lines around blocks that were already resolved are kept as they
 * are, so typing outside a block never moves the text. When the file ends with
 * a block, one empty line follows it for the next paste. A group with no
 * blocks is just the editable text.
 */
export function renderGroupFile(
  sdk: Sdk,
  segments: GroupSegment[],
  resolutions: (Resolution | undefined)[],
): RenderedGroup {
  const isBlank = (text: string) => text.trim() === "";
  const isBlankSegment = (segment: GroupSegment) => segment.kind === "text" && isBlank(segment.text);
  const body: BodyLine[] = [];
  const blocks: Block[] = [];
  const blockImports: ReturnType<typeof liftImports>["imports"][] = [];

  const trailingBlanks = () => {
    let count = 0;
    while (count < body.length && isBlank(body[body.length - 1 - count].text)) count++;
    return count;
  };
  const padBlanks = (have: number) => {
    for (let n = have; n < 2; n++) body.push({ text: "" });
  };

  segments.forEach((segment, index) => {
    if (segment.kind === "imports") return;
    if (segment.kind === "text") {
      body.push({ text: segment.text, stray: !isBlank(segment.text) });
      return;
    }

    const resolution = resolutions[index];
    if (!resolution || !resolution.ok) {
      // An unresolved address stays as editable text, with its problem on it.
      // A block whose pinned address doesn't resolve collapses to that address.
      body.push(
        resolution
          ? { text: segment.text, problem: { kind: resolution.kind, message: resolution.message } }
          : { text: segment.text, stray: true },
      );
      return;
    }

    const isNew = segment.kind === "address";
    if (isNew && body.some((line) => !isBlank(line.text))) padBlanks(trailingBlanks());

    const block: Block = { doc: resolution.doc, publisher: resolution.publisher };
    const code = liftImports(resolution.doc.code);
    blocks.push(block);
    blockImports.push(code.imports);
    const lines = blockLines(resolution.doc, resolution.publisher, code.body);
    lines.forEach((text, i) => {
      const isStart = i === 0;
      const isEnd = i === lines.length - 1;
      body.push(isStart || isEnd ? { text, marker: { block, end: isEnd } } : { text });
    });

    if (isNew) {
      let next = index + 1;
      while (next < segments.length && isBlankSegment(segments[next])) next++;
      const followedByContent = segments.slice(next).some((s) => s.kind !== "imports" && !isBlankSegment(s));
      if (followedByContent) padBlanks(next - index - 1);
    }
  });

  if (blocks.length === 0) return finish(sdk, [], body);

  // The body starts two blank lines under the imports header, and a file
  // that ends with a block ends with one empty line for the next paste.
  while (body.length > 0 && isBlank(body[0].text)) body.shift();
  if (body[body.length - 1]?.marker?.end) body.push({ text: "" });

  const header = [IMPORTS_START, ...mergeImports(blockImports), IMPORTS_END];
  return finish(sdk, header, [{ text: "" }, { text: "" }, ...body]);
}

function finish(sdk: Sdk, header: string[], body: BodyLine[]): RenderedGroup {
  const lines: string[] = [...header];
  const readOnlyRanges: LineRange[] = header.length > 0 ? [{ startLine: 1, endLine: header.length }] : [];
  const members: GroupMember[] = [];
  const problems: GroupProblem[] = [];
  const strayLines: number[] = [];
  let openedAt = 0;

  for (const line of body) {
    lines.push(line.text);
    const lineNumber = lines.length;
    if (line.marker && !line.marker.end) openedAt = lineNumber;
    if (line.marker?.end) {
      const range = { startLine: openedAt, endLine: lineNumber };
      const { owner, name, version } = line.marker.block.doc;
      readOnlyRanges.push(range);
      members.push({ address: addressOf(line.marker.block.doc), owner, name, version, range });
    }
    if (line.problem) problems.push({ line: lineNumber, ...line.problem });
    if (line.stray) strayLines.push(lineNumber);
  }

  problems.push(...findCollisions(members, lines));
  problems.sort((a, b) => a.line - b.line);

  return { sdk, file: lines.join("\n"), members, readOnlyRanges, problems, strayLines };
}

function addressOf(doc: ActivityVersion): string {
  return formatActivityAddress(doc.owner, doc.name, doc.version);
}

/** A block: its opening marker, the comment block, the code without its imports, and the closing marker. */
function blockLines(doc: ActivityVersion, publisher: Publisher, code: string[]): string[] {
  const address = addressOf(doc);
  return [
    blockStart(address),
    `# Pinned: ${doc.name} ${doc.version}, published ${doc.publishedAt.slice(0, 10)}`,
    `# Publisher: ${publisher.displayName} (${publisher.handle})${publisher.verified ? ", Verified Publisher" : ""}`,
    `# Evaluation: ${doc.checks.map(describeCheck).join("; ")}`,
    `# Read-only. To change this block, publish a new version of ${doc.name} and resolve it again.`,
    ...code,
    blockEnd(address),
  ];
}

const CHECK_LABELS: Record<Check["tag"], string> = {
  idempotency: "idempotency",
  compensation: "compensation",
  heartbeat: "heartbeat",
  "non-retryable-errors": "non-retryable errors",
};

const STATUS_LABELS: Record<Check["status"], string> = {
  present: "present",
  absent: "absent",
  "not-applicable": "not applicable",
};

/** "compensation present (declared, durables.dev/kisasa/refund-charge)". Line numbers are left out. */
function describeCheck(check: Check): string {
  let how: string = check.established;
  if (check.tag === "compensation" && check.address) how += `, ${check.address}`;
  if (check.tag === "non-retryable-errors" && check.errorTypes && check.errorTypes.length > 0) {
    how += `: ${check.errorTypes.join(", ")}`;
  }
  return `${CHECK_LABELS[check.tag]} ${STATUS_LABELS[check.status]} (${how})`;
}

/**
 * A top-level `def`, `async def`, `class` or simple assignment name defined in
 * more than one block. Flagged at the defining line in each block, not fixed.
 */
function findCollisions(members: GroupMember[], lines: string[]): GroupProblem[] {
  const definitions = new Map<string, { member: GroupMember; line: number }[]>();

  for (const member of members) {
    const seenHere = new Set<string>();
    for (let lineNumber = member.range.startLine + 1; lineNumber < member.range.endLine; lineNumber++) {
      const name = definedName(lines[lineNumber - 1]);
      if (!name || seenHere.has(name)) continue;
      seenHere.add(name);
      definitions.set(name, [...(definitions.get(name) ?? []), { member, line: lineNumber }]);
    }
  }

  const problems: GroupProblem[] = [];
  for (const [name, places] of definitions) {
    if (places.length < 2) continue;
    for (const place of places) {
      const others = [...new Set(places.filter((other) => other !== place).map((other) => other.member.address))];
      problems.push({
        line: place.line,
        kind: "name-collision",
        message: `\`${name}\` is also defined in the block for ${others.join(", ")}. Blocks in one group can't share top-level names.`,
      });
    }
  }
  return problems;
}

function definedName(line: string): string | null {
  const definition = /^(?:class|def|async[ \t]+def)[ \t]+(\w+)/.exec(line);
  if (definition) return definition[1];
  const assignment = /^(\w+)[ \t]*(?::[^=\n]*)?=(?!=)/.exec(line);
  return assignment ? assignment[1] : null;
}
