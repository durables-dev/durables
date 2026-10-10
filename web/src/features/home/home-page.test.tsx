import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { HomePage } from "./home-page";

test("shows the headline", async () => {
  const screen = await render(<HomePage />);

  await expect.element(screen.getByRole("heading", { level: 1 })).toBeVisible();
});
