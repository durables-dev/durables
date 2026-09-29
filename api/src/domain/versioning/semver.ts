// Plain x.y.z versions: ordering and bumping. Signature comparison is in suggest-version.ts.

/** The version every listing name starts at. */
export const FIRST_VERSION = "1.0.0";

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** The highest version, which is the listing's default. Null when there are none. */
export function highestVersion(versions: string[]): string | null {
  return versions.length === 0 ? null : [...versions].sort(compareVersions).at(-1)!;
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Whether `version` is a plain `x.y.z`, with no leading zeros, pre-release or build suffix. */
export function isVersion(version: string): boolean {
  return VERSION.test(version);
}

/** `1.4.2` bumped: major → `2.0.0`, minor → `1.5.0`, patch → `1.4.3`. */
export function bumpVersion(version: string, bump: "major" | "minor" | "patch"): string {
  const [major, minor, patch] = version.split(".").map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
