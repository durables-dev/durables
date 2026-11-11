import { expect, test } from "../fixtures";

test("the home page loads", async ({ page, expectAccessible }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible();
});

test("the API answers through the website's origin", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
});
