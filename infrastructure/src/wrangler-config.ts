import { readFileSync } from "node:fs";

// The values infrastructure must share with api/wrangler.toml (ADR 0004): read from that
// file at synth so they cannot drift, and asserted by the Worker construct's test.

export interface RateLimitBinding {
  readonly name: string;
  readonly namespaceId: string;
  readonly limit: number;
  readonly period: number;
}

export interface WranglerConfig {
  readonly compatibilityDate: string;
  readonly compatibilityFlags: readonly string[];
  readonly d1Binding: string;
  readonly r2Binding: string;
  readonly assetsBinding: string;
  readonly rateLimits: readonly RateLimitBinding[];
}

export function readWranglerConfig(path: string): WranglerConfig {
  const toml = readFileSync(path, "utf8");
  return {
    compatibilityDate: required(toml, /^compatibility_date\s*=\s*"([^"]+)"/m),
    compatibilityFlags: list(toml, /^compatibility_flags\s*=\s*\[([^\]]*)\]/m),
    d1Binding: required(
      toml,
      /\[\[d1_databases\]\][^[]*?binding\s*=\s*"([^"]+)"/,
    ),
    r2Binding: required(
      toml,
      /\[\[r2_buckets\]\][^[]*?binding\s*=\s*"([^"]+)"/,
    ),
    assetsBinding: required(toml, /\[assets\][^[]*?binding\s*=\s*"([^"]+)"/),
    rateLimits: rateLimits(toml),
  };
}

function rateLimits(toml: string): RateLimitBinding[] {
  const sections = toml.split(/^\[\[unsafe\.bindings\]\]\s*$/m).slice(1);
  return sections
    .filter((section) => /^type\s*=\s*"ratelimit"/m.test(section))
    .map((section) => ({
      name: required(section, /^name\s*=\s*"([^"]+)"/m),
      namespaceId: required(section, /^namespace_id\s*=\s*"([^"]+)"/m),
      limit: Number(required(section, /limit\s*=\s*(\d+)/)),
      period: Number(required(section, /period\s*=\s*(\d+)/)),
    }));
}

function required(toml: string, pattern: RegExp): string {
  const value = pattern.exec(toml)?.[1];
  if (!value) throw new Error(`api/wrangler.toml is missing ${pattern.source}`);
  return value;
}

function list(toml: string, pattern: RegExp): string[] {
  const inner = pattern.exec(toml)?.[1] ?? "";
  return [...inner.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}
