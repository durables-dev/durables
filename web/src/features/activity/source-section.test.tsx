import "@/styles/global.css";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SourceSection, type SourceSectionProps } from "./source-section";
import { TestProviders } from "../../../test/test-providers";
import {
  failCatalog,
  profileFor,
  serveCatalog,
} from "../../../test/serve-sdk-catalog";
import { newSdkSamples } from "./test-versions";
import { testCatalog } from "../../../test/sdk-catalog";

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
  const screen = await render(<SourceSection {...chargeCard} {...props} />, {
    wrapper: TestProviders,
  });
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

test("the code is highlighted in the language the catalog names for the SDK", async () => {
  // A catalog that names no language Durables highlights for Python leaves its code plain.
  serveCatalog(
    testCatalog.map((profile) =>
      profile.name === "Python"
        ? { ...profile, highlightLanguage: "plaintext" }
        : profile,
    ),
  );
  const screen = await render(
    <>
      <section aria-label="Python">
        <SourceSection {...chargeCard} />
      </section>
      <section aria-label="TypeScript">
        <SourceSection
          sdk="TypeScript"
          code="export async function charge(): Promise<void> {}"
          activityFileName="activities.ts"
        />
      </section>
    </>,
    { wrapper: TestProviders },
  );
  const coloured = (sdk: string) =>
    screen
      .getByRole("region", { name: sdk })
      .element()
      .querySelectorAll("code span[style]").length;

  // Both read the same catalog, so once TypeScript is coloured, Python has its profile too.
  await expect.poll(() => coloured("TypeScript")).toBeGreaterThan(0);
  expect(coloured("Python")).toBe(0);
});

test.each(newSdkSamples)(
  "a $sdk activity's code is highlighted in $highlightLanguage, and is still exactly as published",
  async ({ sdk, highlightLanguage, activityFileName, code }) => {
    serveCatalog([
      ...testCatalog,
      profileFor(sdk, highlightLanguage, activityFileName),
    ]);
    const block = await renderSource({ sdk, activityFileName, code });

    await expect.poll(block.coloured).toBeGreaterThan(0);
    expect(block.code()).toBe(code);
  },
);

test("when the catalog cannot be read, the code shows as plain text, unchanged", async () => {
  const failed = failCatalog();
  const block = await renderSource();
  await failed;

  expect(block.coloured()).toBe(0);
  expect(block.code()).toBe(CHARGE_CARD);
  expect(block.numbers()).toHaveLength(12);
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
