import { rubyDetector, rubyRecognition } from "../checks/ruby-detector";
import { isRubyStandardLibrary } from "../checks/ruby-stdlib";
import { rubySnippets } from "../snippets/ruby-snippets";
import type { SdkEntry } from "./sdk-entry";

/**
 * The integration key for a Ruby dependency: the name it is required by, as a gem name. Gems
 * name a required path with dashes (`google/cloud/storage` is `google-cloud-storage`), and
 * the key is lower-cased.
 */
export const normaliseRubyDependency = (name: string) =>
  name.trim().toLowerCase().replace(/\.rb$/, "").replaceAll("/", "-");

/** The Ruby SDK. Dependencies are required names, matched as gem names. */
export const ruby: SdkEntry<"Ruby"> = {
  sdk: "Ruby",
  recognition: rubyRecognition,
  detector: rubyDetector,
  snippets: rubySnippets,
  isStandardLibrary: isRubyStandardLibrary,
  normaliseDependency: normaliseRubyDependency,
  display: {
    package: "temporalio",
    highlightLanguage: "ruby",
    activityFileName: "activities.rb",
    // Ruby's default activity executor runs a sync activity, and the generated worker sets up
    // nothing. Detection leaves Runs as blank for a fiber activity, so the async wording is
    // there only so every SDK answers both.
    runsAs: {
      sync: "Synchronous: the worker needs no special setup",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. Your worker needs no special setup to run it.",
      async:
        "This is an async activity. Your worker needs no special setup to run it.",
    },
  },
};
