import {
  isRustStandardLibrary,
  normaliseRustCrate,
  rustDetector,
  rustRecognition,
} from "../checks/rust-detector";
import { rustSnippets } from "../snippets/rust-snippets";
import logo from "./logos/rust.svg";
import type { SdkEntry } from "./sdk-entry";

/**
 * The Rust SDK. Dependencies are the crate a `use` path starts from, matched without regard to
 * case, with a crate's hyphens and underscores read as the same.
 */
export const rust: SdkEntry<"Rust"> = {
  sdk: "Rust",
  recognition: rustRecognition,
  detector: rustDetector,
  snippets: rustSnippets,
  isStandardLibrary: isRustStandardLibrary,
  normaliseDependency: normaliseRustCrate,
  display: {
    package: "temporalio-sdk",
    highlightLanguage: "rust",
    activityFileName: "activities.rs",
    // Rust activities are async fn, and the generated worker sets up no thread pool. The sync
    // wording is there so every SDK answers both, and names no thread pool either.
    runsAs: {
      sync: "Synchronous: the worker needs no special setup",
      async: "Async",
    },
    workerRequirements: {
      sync: "This is a synchronous activity. Your worker needs no special setup to run it.",
      async:
        "This is an async activity. Your worker needs no special setup to run it.",
    },
    logo,
    // The Rust logo is black only, so it sits on a light tile to stay visible in dark mode.
    lightTile: true,
  },
};
