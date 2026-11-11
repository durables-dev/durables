import { afterEach, expect, test, vi } from "vitest";
import { currentYear } from "./current-year";

afterEach(() => {
  vi.useRealTimers();
});

test("reads the year from the clock", () => {
  vi.useFakeTimers({ toFake: ["Date"] });

  vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
  expect(currentYear()).toBe(2026);

  vi.setSystemTime(new Date(2027, 0, 1, 0, 0));
  expect(currentYear()).toBe(2027);
});
