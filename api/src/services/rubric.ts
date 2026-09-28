import { RUBRIC } from "../domain/patterns/rubric.js";
import type { RubricEntry } from "../model/rubric.js";

export function listRubric(): RubricEntry[] {
  return RUBRIC;
}
