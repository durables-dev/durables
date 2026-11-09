import "@/styles/global.css";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SearchField } from "./search-field";

test("the field is labelled Search activities and starts with the words given", async () => {
  const screen = await render(<SearchField defaultValue="retry payments" />);

  const field = screen.getByRole("searchbox", { name: "Search activities" });
  await expect.element(field).toHaveValue("retry payments");
  await expect
    .element(field)
    .toHaveAttribute(
      "placeholder",
      "Describe what you need, or just use Filters",
    );
  expect(field.element().getAttribute("name")).toBe("q");
});

test("the field starts empty when no words are given", async () => {
  const screen = await render(<SearchField />);

  await expect
    .element(screen.getByRole("searchbox", { name: "Search activities" }))
    .toHaveValue("");
});

test("controls passed in sit inside the box", async () => {
  const screen = await render(
    <SearchField>
      <button type="button">Filters</button>
    </SearchField>,
  );

  const field = screen
    .getByRole("searchbox", { name: "Search activities" })
    .element();
  const button = screen.getByRole("button", { name: "Filters" }).element();
  expect(field.parentElement).not.toBeNull();
  expect(field.parentElement?.contains(button)).toBe(true);
  expect(
    field.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
