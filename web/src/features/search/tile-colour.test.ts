import { describe, expect, test } from "vitest";
import { tileColour, tileColours } from "./tile-colour";

describe("tileColour", () => {
  test("the same title and publisher always get the same colour", () => {
    const first = tileColour("Charge card", "ddieruf");
    for (let draw = 0; draw < 5; draw += 1) {
      expect(tileColour("Charge card", "ddieruf")).toBe(first);
    }
  });

  test("the colour is one of the brand colours", () => {
    expect(tileColours).toContain(tileColour("Send email", "kisasa"));
    expect(tileColours).toContain(tileColour("", ""));
  });

  test("the publisher takes part in the pick", () => {
    const handles = ["ddieruf", "kisasa", "temporal-fan", "acme", "zed", "q"];
    const colours = new Set(
      handles.map((handle) => tileColour("Charge card", handle)),
    );
    expect(colours.size).toBeGreaterThan(1);
  });

  test("the title takes part in the pick", () => {
    const titles = ["Charge card", "Send email", "Resize image", "Post", "Q"];
    const colours = new Set(
      titles.map((title) => tileColour(title, "ddieruf")),
    );
    expect(colours.size).toBeGreaterThan(1);
  });
});
