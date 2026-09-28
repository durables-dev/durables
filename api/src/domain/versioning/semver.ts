// Plain x.y.z version ordering. Signature comparison and version suggestion arrive with step 13.

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
