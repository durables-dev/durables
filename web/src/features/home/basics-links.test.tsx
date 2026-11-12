import "@/styles/global.css";
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { BasicsLinks } from "./basics-links";

describe.each([
  {
    label: "What is Temporal?",
    text: /open-source platform for durable execution/,
    docs: "Read the Temporal docs",
    href: "https://docs.temporal.io/",
  },
  {
    label: "What is an activity?",
    text: /activities do the work/,
    docs: "Activities in the Temporal docs",
    href: "https://docs.temporal.io/activities",
  },
])("$label", ({ label, text, docs, href }) => {
  test("opens a dialog with the explanation and a link to the Temporal docs", async () => {
    const screen = await render(<BasicsLinks />);

    await screen.getByRole("button", { name: label }).click();

    const dialog = screen.getByRole("dialog", { name: label });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog.getByRole("heading", { level: 2, name: label }))
      .toBeVisible();
    await expect.element(dialog.getByText(text)).toBeVisible();
    const link = dialog.getByRole("link", { name: docs });
    await expect.element(link).toHaveAttribute("href", href);
    await expect.element(link).toHaveAttribute("target", "_blank");
  });

  test("the close button closes it and gives focus back to the button that opened it", async () => {
    const screen = await render(<BasicsLinks />);
    const opener = screen.getByRole("button", { name: label });

    await opener.click();
    await screen
      .getByRole("dialog", { name: label })
      .getByRole("button", { name: "Close" })
      .click();

    await expect
      .element(screen.getByRole("dialog", { name: label }))
      .not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
  });

  test("Escape closes it and gives focus back to the button that opened it", async () => {
    const screen = await render(<BasicsLinks />);
    const opener = screen.getByRole("button", { name: label });

    await opener.click();
    await expect
      .element(screen.getByRole("dialog", { name: label }))
      .toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect
      .element(screen.getByRole("dialog", { name: label }))
      .not.toBeInTheDocument();
    await expect.element(opener).toHaveFocus();
  });
});

test("says Durables is not made or endorsed by Temporal, and claims no behaviour checks", async () => {
  const screen = await render(<BasicsLinks />);

  await screen.getByRole("button", { name: "What is Temporal?" }).click();
  await expect
    .element(
      screen.getByText(
        "Durables is a community project for Temporal developers. It isn’t made or endorsed by Temporal Technologies.",
      ),
    )
    .toBeVisible();
  await userEvent.keyboard("{Escape}");

  await screen.getByRole("button", { name: "What is an activity?" }).click();
  const dialog = screen.getByRole("dialog", { name: "What is an activity?" });
  await expect.element(dialog).toBeVisible();
  expect(dialog.element().textContent).not.toMatch(/reports on/i);
});
