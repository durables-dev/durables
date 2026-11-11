import type { Facts } from "../checks/facts";
import type { Address, Snippet } from "../storage/version-document";
import { dotnetSnippets } from "./dotnet-snippets";
import { pythonSnippets } from "./python-snippets";
import { typescriptSnippets } from "./typescript-snippets";

// The Implement snippets (ADR 0008): generated from the publish-time facts and stored in the
// version document, which can never gain them later. The published code is the activity file
// and is never generated. `web` renders the snippets and never generates code.

export { activityFileName, installLabel, runLabel } from "./labels";

/**
 * The Implement snippets for a version, in the order the Activity page shows them: the install
 * command, the workflow, worker and starter files, then the run commands. The same facts and
 * address always give the same snippets.
 */
export const generateSnippets = (facts: Facts, address: Address): Snippet[] => {
  switch (facts.sdk) {
    case "Python":
      return pythonSnippets(facts, address);
    case "TypeScript":
      return typescriptSnippets(facts, address);
    case ".NET":
      return dotnetSnippets(facts, address);
  }
};
