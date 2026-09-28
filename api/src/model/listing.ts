// Written from the POC-5 API map, boundaries 1 and 3.

import type { Check } from "./check.js";
import type { Sdk } from "./detection.js";

export type ReadmeTemplate = {
  markdown: string;
  requiredHeadings: string[];
};

export type SnippetTab = "install" | "activity" | "workflow" | "worker" | "starter";

export type Snippet = {
  tab: SnippetTab;
  /** Absent for install. The file the consumer saves it as. */
  filename?: string;
  language: "shell" | "python";
  /** Exactly what the copy button copies. */
  content: string;
};

export type Listing = {
  address: string;
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  publisher: { handle: string; displayName: string; verified: boolean };
  sdk: Sdk;
  code: string;
  snippets: Snippet[];
  configuration: { name: string; purpose: string; line: number }[];
  readme: string;
  checks: Check[];
};
