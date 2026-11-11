import "@/styles/global.css";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SourceSection, type SourceSectionProps } from "./source-section";

const CHARGE_CARD = [
  "import os",
  "",
  "import stripe",
  "from temporalio import activity",
  "",
  'stripe.api_key = os.environ["STRIPE_API_KEY"]',
  "",
  "",
  "@activity.defn",
  "def charge_card(input: ChargeRequest) -> ChargeResult:",
  "    intent = stripe.PaymentIntent.create(amount=input.amount_cents)",
  "    return ChargeResult(charge_id=intent.id, status=intent.status)",
].join("\n");

// Tabs, a two-space and a three-space indent, trailing spaces and a Windows line ending.
const ODD_INDENTATION = [
  "from temporalio import activity",
  "",
  "@activity.defn",
  "def odd(input: str) -> str:",
  "\tif input:   ",
  "\t\treturn input",
  "  value = input.strip()\r",
  "   return value",
  "",
].join("\n");

const chargeCard: SourceSectionProps = {
  code: CHARGE_CARD,
  activityFileName: "activities.py",
  sdk: "Python",
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderSource(props: Partial<SourceSectionProps> = {}) {
  const screen = await render(<SourceSection {...chargeCard} {...props} />);
  const region = screen.getByRole("region", { name: "published code" });
  await expect.element(region).toBeVisible();
  const element = region.element();
  return {
    screen,
    code: () => element.querySelector("code")?.textContent,
    numbers: () =>
      [...element.querySelectorAll('[aria-hidden="true"] > *')].map(
        (number) => number.textContent,
      ),
    coloured: () => element.querySelectorAll("code span[style]").length,
  };
}

test('the section is headed "Source"', async () => {
  const { screen } = await renderSource();

  await expect
    .element(screen.getByRole("heading", { level: 2, name: "Source" }))
    .toBeVisible();
});

test.each([
  ["Python", "activities.py"],
  ["TypeScript", "activities.ts"],
  [".NET", "Activities.cs"],
] as const)(
  "a %s version is headed with %s and the line count",
  async (sdk, activityFileName) => {
    const { screen } = await renderSource({ sdk, activityFileName });

    await expect
      .element(screen.getByText(`${activityFileName} · 12 lines`))
      .toBeVisible();
  },
);

test("the heading sits above the code, on the same row as Copy and to its left", async () => {
  const { screen } = await renderSource();

  const caption = screen.getByText("activities.py · 12 lines").element();
  const copy = screen
    .getByRole("button", { name: "Copy published code" })
    .element();
  const region = screen
    .getByRole("region", { name: "published code" })
    .element();
  const captionBox = caption.getBoundingClientRect();
  const copyBox = copy.getBoundingClientRect();
  expect(captionBox.right).toBeLessThanOrEqual(copyBox.left);
  expect(
    Math.abs(
      captionBox.top +
        captionBox.height / 2 -
        (copyBox.top + copyBox.height / 2),
    ),
  ).toBeLessThan(8);
  expect(captionBox.bottom).toBeLessThanOrEqual(
    region.getBoundingClientRect().top,
  );
});

test('a one-line file is headed "1 line"', async () => {
  const { screen } = await renderSource({ code: "print('hello')" });

  await expect
    .element(screen.getByText("activities.py · 1 line"))
    .toBeVisible();
});

test("the code is exactly the published code, with a number on every line", async () => {
  const block = await renderSource();

  expect(block.code()).toBe(CHARGE_CARD);
  expect(block.numbers()).toEqual(
    Array.from({ length: 12 }, (_, i) => String(i + 1)),
  );
});

test("highlighted code is still exactly the published code", async () => {
  const block = await renderSource();

  await expect.poll(block.coloured).toBeGreaterThan(0);
  expect(block.code()).toBe(CHARGE_CARD);
});

test("tabs and odd indentation are shown unchanged, and a final line break is not counted as a line", async () => {
  const block = await renderSource({ code: ODD_INDENTATION });

  await expect.poll(block.coloured).toBeGreaterThan(0);
  expect(block.code()).toBe(ODD_INDENTATION);
  expect(block.numbers()).toHaveLength(9);
  await expect
    .element(block.screen.getByText("activities.py · 8 lines"))
    .toBeVisible();
});

test('Copy puts the published code on the clipboard and shows "Copied"', async () => {
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  const { screen } = await renderSource({ code: ODD_INDENTATION });

  await screen.getByRole("button", { name: "Copy published code" }).click();

  await expect.element(screen.getByRole("status")).toHaveTextContent("Copied");
  expect(writeText).toHaveBeenCalledExactlyOnceWith(ODD_INDENTATION);
});
