import { README_TEMPLATE } from "../domain/readme/readme-template.js";
import type { ReadmeTemplate } from "../model/listing.js";

export function getReadmeTemplate(): ReadmeTemplate {
  return README_TEMPLATE;
}
