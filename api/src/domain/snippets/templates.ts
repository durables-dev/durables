import { readFileSync } from "node:fs";
import type { Sdk } from "../../model/detection.js";

// Loads the plain-file snippet templates once, when the module is first imported.
// They ship with the source, so this is reading code, not data: the generators
// that use them stay pure.

export type TemplateName = "install" | "workflow" | "worker" | "starter";

const cache = new Map<string, string>();

export function snippetTemplate(sdk: Sdk, name: TemplateName): string {
  const key = `${sdk}/${name}`;
  let template = cache.get(key);
  if (template === undefined) {
    template = readFileSync(new URL(`./templates/${key}.tmpl`, import.meta.url), "utf8");
    cache.set(key, template);
  }
  return template;
}
