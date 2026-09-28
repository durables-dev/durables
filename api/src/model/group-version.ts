// Written from the POC-6 API map, boundaries 1–4.

import type { Sdk } from "./detection.js";

/** One published version of a group: a document in DocumentStore. Immutable once written. */
export type GroupVersion = {
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  sdk: Sdk;
  /** Pinned activity addresses, in file order. The group file is regenerated from these, never stored. */
  members: string[];
};

/** 1-based, inclusive. */
export type LineRange = { startLine: number; endLine: number };

export type GroupMember = {
  /** Always pinned: "durables.dev/kisasa/charge-card@1.0.0". */
  address: string;
  owner: string;
  name: string;
  version: string;
  /** The block's lines in the file, markers included. */
  range: LineRange;
};

export type GroupProblemKind = "unknown-address" | "wrong-sdk" | "other-publisher" | "name-collision";

export type GroupProblem = {
  /** In the returned file. */
  line: number;
  kind: GroupProblemKind;
  /** Shown as the editor marker's text. */
  message: string;
};

export type ResolveGroupRequest = { sdk: Sdk; source: string };

export type ResolvedGroup = {
  sdk: Sdk;
  /** What the editor shows next. */
  file: string;
  /** In file order. */
  members: GroupMember[];
  /** The imports header and each whole block, markers included. */
  readOnlyRanges: LineRange[];
  problems: GroupProblem[];
};

export type PublishGroupRequest = { name: string; sdk: Sdk; source: string };

export type PublishGroupResult = { address: string; owner: string; name: string; version: string };

export type GroupListing = {
  address: string;
  owner: string;
  name: string;
  version: string;
  publishedAt: string;
  publisher: { handle: string; displayName: string; verified: boolean };
  sdk: Sdk;
  /** The group name in snake_case, plus ".py". */
  filename: string;
  /** Exactly what the copy button copies. */
  file: string;
  /** Pinned, in file order. */
  members: { address: string; owner: string; name: string; version: string }[];
};
