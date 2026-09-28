import type { Sdk } from "../../model/detection.js";
import type { Snippet } from "../../model/listing.js";
import { generateDotnetSnippets } from "./dotnet-snippets.js";
import { generatePythonSnippets } from "./python-snippets.js";
import type { SnippetSource } from "./snippet-source.js";
import { generateTypeScriptSnippets } from "./typescript-snippets.js";

// Picks the template set for the listing's SDK. Every SDK gets the same five
// tabs, in the same order: install, activity, workflow, worker, starter.

const GENERATORS: Record<Sdk, (source: SnippetSource) => Snippet[]> = {
  python: generatePythonSnippets,
  typescript: generateTypeScriptSnippets,
  dotnet: generateDotnetSnippets,
};

export function generateSnippets(sdk: Sdk, source: SnippetSource): Snippet[] {
  return GENERATORS[sdk](source);
}
