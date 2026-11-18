import { expect, test } from "vitest";
import {
  choiceFailedMessage,
  finalDate,
  restoreChoiceSchema,
} from "./restore-choice";

test("the final date reads as day, month and year", () => {
  // Midday UTC is the same day in every time zone the test might run in.
  expect(finalDate("2026-12-17T12:00:00.000Z")).toBe("17 December 2026");
});

test("a final time that cannot be read gives no date", () => {
  expect(finalDate("not a time")).toBeUndefined();
  expect(finalDate("")).toBeUndefined();
});

test("only the two choices are accepted", () => {
  expect(restoreChoiceSchema.safeParse("restore").success).toBe(true);
  expect(restoreChoiceSchema.safeParse("start-over").success).toBe(true);
  expect(restoreChoiceSchema.safeParse("delete").success).toBe(false);
  expect(restoreChoiceSchema.safeParse(null).success).toBe(false);
});

test("each choice has its own failure message, asking to try again", () => {
  expect(choiceFailedMessage("restore")).toBe(
    "Restoring didn't finish. Try again.",
  );
  expect(choiceFailedMessage("start-over")).toBe(
    "Starting as a new user didn't finish. Try again.",
  );
});
