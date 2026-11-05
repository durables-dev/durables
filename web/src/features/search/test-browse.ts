import { http, HttpResponse } from "msw";
import { worker } from "../../../test/worker";
import type { ActivityCard, BrowseResponse } from "./activity-card";

// A fake of the browse read for component tests: GET /api/activities answered from a list of
// cards in batches of 50, with an opaque cursor. Each call is recorded, so a test can see what
// the page asked for and how often.

const batchSize = 50;

const problemHeaders = { "Content-Type": "application/problem+json" };

/** What the page sent on one browse call. */
export interface BrowseCall {
  q: string | null;
  sdks: string[];
  integrations: string[];
  publisher: string | null;
  cursor: string | null;
}

export interface ServeBrowseOptions {
  /** The cards that match a call. All of them, by default. */
  matching?: (call: BrowseCall) => readonly ActivityCard[];
  /** Held until it settles before the call is answered. */
  before?: (call: BrowseCall) => Promise<void> | undefined;
  /** Whether to answer the call with a 500 instead. */
  fails?: (call: BrowseCall) => boolean;
}

/** A card for a test, numbered so each one has its own address and title. */
export function testCard(
  index: number,
  card: Partial<ActivityCard> = {},
): ActivityCard {
  const name = `activity-${index}`;
  return {
    address: `ddieruf/${name}@1.0.0`,
    handle: "ddieruf",
    name,
    version: "1.0.0",
    title: `Activity ${index}`,
    sdk: "Python",
    description: `Does task number ${index}.`,
    integrations: [],
    publishedAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    ...card,
  };
}

/** Numbered test cards, from 1 to count. */
export function testCards(count: number): ActivityCard[] {
  return Array.from({ length: count }, (_, index) => testCard(index + 1));
}

/** A gate a test opens when it wants a held call to be answered. */
export function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open: () => open() };
}

function callFrom(request: Request): BrowseCall {
  const params = new URL(request.url).searchParams;
  return {
    q: params.get("q"),
    sdks: params.getAll("sdk"),
    integrations: params.getAll("integration"),
    publisher: params.get("publisher"),
    cursor: params.get("cursor"),
  };
}

/** Answers browse calls from the given cards, and returns the calls as they arrive. */
export function serveBrowse(
  cards: readonly ActivityCard[],
  {
    matching = () => cards,
    before,
    fails = () => false,
  }: ServeBrowseOptions = {},
): BrowseCall[] {
  const calls: BrowseCall[] = [];
  worker.use(
    http.get("/api/activities", async ({ request }) => {
      const call = callFrom(request);
      calls.push(call);
      await before?.(call);
      if (fails(call)) {
        return HttpResponse.json(
          { type: "about:blank", title: "Internal Server Error", status: 500 },
          { status: 500, headers: problemHeaders },
        );
      }
      const matches = matching(call);
      const start = call.cursor === null ? 0 : Number(call.cursor);
      const end = start + batchSize;
      const body: BrowseResponse = {
        activities: matches.slice(start, end),
        count: matches.length,
        sort: (call.q ?? "").trim() === "" ? "newest" : "relevance",
        nextCursor: end < matches.length ? String(end) : null,
      };
      return HttpResponse.json(body);
    }),
  );
  return calls;
}
