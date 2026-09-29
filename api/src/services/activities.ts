import { findAccount } from "../db/accounts-repository.js";
import { insertOwnership } from "../db/ownership-repository.js";
import { formatActivityAddress, isActivityAddress, parseActivityAddress } from "../domain/addresses/address.js";
import { toKebabCase } from "../domain/addresses/names.js";
import type { Detector } from "../domain/detection/detector.js";
import { dotnetDetector } from "../domain/detection/dotnet.js";
import { pythonDetector } from "../domain/detection/python.js";
import { typescriptDetector } from "../domain/detection/typescript.js";
import { buildChecks } from "../domain/patterns/checks.js";
import { idempotencyRubricFor } from "../domain/patterns/rubric.js";
import { findMissingHeadings } from "../domain/readme/readme-template.js";
import { generateSnippets } from "../domain/snippets/snippets.js";
import { compareVersions, FIRST_VERSION, highestVersion, isVersion } from "../domain/versioning/semver.js";
import { suggestVersion } from "../domain/versioning/suggest-version.js";
import type { ActivityVersion, PublishRequest, PublishResult } from "../model/activity-version.js";
import type { Check, Declarations } from "../model/check.js";
import type { Detection } from "../model/detection.js";
import type { Listing } from "../model/listing.js";
import type { VersionSuggestion } from "../model/version-suggestion.js";
import { VersionExistsError } from "../storage/document-store.js";
import { currentAccount } from "./accounts.js";
import { documents } from "./documents.js";
import { BadRequestError, ServiceError } from "./errors.js";

const DETECTORS: Detector[] = [pythonDetector, typescriptDetector, dotnetDetector];

/**
 * Picks the detector by the SDK's marker in the code: a `temporalio` import for
 * Python, an `@temporalio/...` import for TypeScript, a `using Temporalio...;`
 * directive for .NET. Error handling is faked: code with no recognised marker
 * throws here, and code that doesn't parse throws in the detector, so both
 * fail as a raw 500.
 */
// POC-SHORTCUT: SC-003
function detectorFor(code: string): Detector {
  const detector = DETECTORS.find((candidate) => candidate.recognises(code));
  if (!detector) throw new Error("No Temporal SDK import found (Python, TypeScript or .NET)");
  return detector;
}

export function detectActivity(code: string): Detection {
  return detectorFor(code).detect(code);
}

// POC-SHORTCUT: SC-004
export function checkActivity(code: string, declarations: Declarations): Check[] {
  const address = declarations.compensation.address;
  // POC-SHORTCUT: SC-005
  if (declarations.compensation.status === "present" && (!address || !isActivityAddress(address))) {
    throw new BadRequestError("Compensation must be an address like durables.dev/<owner>/<name>, optionally @<version>.");
  }
  const detection = detectActivity(code);
  return buildChecks(code, declarations, detection, idempotencyRubricFor(detection.sdk.value));
}

/**
 * Suggests the version for publishing `code`: 1.0.0 when the signed-in user has
 * not published its listing name, otherwise a bump of their highest published
 * version, with the reasons. Both signatures are re-derived from code: the
 * stored `detection` of the previous version is never read, because it may
 * predate detection that the comparison relies on (dataclass fields).
 */
export async function suggestActivityVersion(
  headers: Record<string, string | string[] | undefined>,
  code: string,
): Promise<VersionSuggestion> {
  const owner = currentAccount(headers);
  if (!owner) throw new ServiceError(401, "Unknown user");

  const current = detectActivity(code);
  const name = toKebabCase(current.activityName.value);
  const previousVersion = highestVersion(await documents().listActivityVersions(owner.handle, name));
  const previousDoc = previousVersion ? await documents().getActivityVersion(owner.handle, name, previousVersion) : null;
  const previous = previousDoc ? detectActivity(previousDoc.code) : null;

  return { name, ...suggestVersion(previous, current, previousDoc ? previousVersion : null) };
}

/**
 * Publishes a version of an activity. Detection and the pattern check are
 * re-run here, so nothing stored comes from the client's own results. The
 * listing name is the detected activity name in kebab-case, and the owner is
 * the signed-in user. A first publish is always 1.0.0. A later one takes the
 * publisher's `version`, which must be higher than every published version;
 * a smaller bump than suggested is never refused.
 */
// POC-SHORTCUT: SC-010
export async function publishActivity(
  headers: Record<string, string | string[] | undefined>,
  request: PublishRequest,
): Promise<PublishResult> {
  const owner = currentAccount(headers);
  if (!owner) throw new ServiceError(401, "Unknown user");

  const { code, declarations, readme, exampleInput } = request;
  const missingHeadings = findMissingHeadings(readme ?? "");
  if (missingHeadings.length > 0) {
    throw new BadRequestError(`The README is missing, or has nothing under: ${missingHeadings.join(", ")}.`, {
      missingHeadings,
    });
  }
  if (typeof exampleInput !== "object" || exampleInput === null || Array.isArray(exampleInput)) {
    throw new BadRequestError("The example input must be a JSON object.");
  }

  const detection = detectActivity(code);
  const checks = checkActivity(code, declarations);
  if (declarations.compensation.status === "present") {
    await resolveCompensation(declarations.compensation.address!);
  }

  const name = toKebabCase(detection.activityName.value);
  const version = chooseVersion(
    formatActivityAddress(owner.handle, name),
    await documents().listActivityVersions(owner.handle, name),
    request.version,
  );

  const doc: ActivityVersion = {
    owner: owner.handle,
    name,
    version,
    publishedAt: new Date().toISOString(),
    sdk: detection.sdk.value,
    code,
    detection,
    declarations: {
      ...declarations,
      compensation: declarations.compensation.address
        ? { ...declarations.compensation, address: declarations.compensation.address.trim() }
        : declarations.compensation,
    },
    checks,
    readme,
    exampleInput,
  };

  // Consistency between stores is faked: the document is written first, then
  // the ownership row, with no transaction. If the row fails, the document stays.
  // POC-SHORTCUT: SC-008
  try {
    await documents().putActivityVersion(doc);
  } catch (error) {
    if (error instanceof VersionExistsError) throw new ServiceError(409, error.message);
    throw error;
  }
  await insertOwnership(owner.handle, "activity", name);

  return { address: formatActivityAddress(owner.handle, name, version), owner: owner.handle, name, version };
}

/** 1.0.0 for a first publish. Otherwise the requested version, if it is a plain x.y.z above every published one. */
function chooseVersion(address: string, published: string[], requested: string | undefined): string {
  const highest = highestVersion(published);
  if (!highest) return FIRST_VERSION;
  const version = typeof requested === "string" ? requested.trim() : "";
  if (version === "") {
    throw new BadRequestError(`${address} is already published at ${highest}. Give the new version's number.`);
  }
  if (!isVersion(version)) throw new BadRequestError(`The version must look like 2.0.0 (x.y.z), not ${version}.`);
  if (published.includes(version)) throw new ServiceError(409, `${address}@${version} is already published. Versions can't be changed.`);
  if (compareVersions(version, highest) <= 0) {
    throw new BadRequestError(`The version must be higher than ${highest}, the highest published version of ${address}.`);
  }
  return version;
}

/** The compensation address must name a published activity (a specific version, if it pins one). */
async function resolveCompensation(address: string): Promise<void> {
  const parsed = parseActivityAddress(address);
  const versions = parsed ? await documents().listActivityVersions(parsed.owner, parsed.name) : [];
  const found = parsed?.version ? versions.includes(parsed.version) : versions.length > 0;
  if (!found) {
    throw new BadRequestError(`The compensation address ${address.trim()} is not a published activity.`);
  }
}

/** The listing for one version, or for the default (highest) version when none is given. */
export async function getListing(owner: string, name: string, version?: string): Promise<Listing> {
  const published = await documents().listActivityVersions(owner, name);
  const latestVersion = highestVersion(published);
  const resolved = version ?? latestVersion;
  const doc = resolved && published.includes(resolved) ? await documents().getActivityVersion(owner, name, resolved) : null;
  if (!doc || !latestVersion) throw new ServiceError(404, `${formatActivityAddress(owner, name, version)} is not published.`);

  const account = await findAccount(doc.owner);
  const detectedLines = new Map(doc.detection.envVars.map((envVar) => [envVar.value, envVar.line]));

  return {
    address: formatActivityAddress(doc.owner, doc.name, doc.version),
    owner: doc.owner,
    name: doc.name,
    version: doc.version,
    publishedAt: doc.publishedAt,
    publisher: account
      ? { handle: account.handle, displayName: account.displayName, verified: account.verified }
      : { handle: doc.owner, displayName: doc.owner, verified: false },
    sdk: doc.sdk,
    code: doc.code,
    detection: doc.detection,
    snippets: generateSnippets(doc.sdk, doc),
    configuration: doc.declarations.envVars.map(({ name: envName, purpose }) => ({
      name: envName,
      purpose,
      line: detectedLines.get(envName) ?? 0,
    })),
    readme: doc.readme,
    checks: doc.checks,
    latestVersion,
    versions: await versionHistory(owner, name, published),
  };
}

/** Every published version with its publish date, highest first. Each date comes from that version's document. */
async function versionHistory(owner: string, name: string, published: string[]): Promise<Listing["versions"]> {
  const sorted = [...published].sort(compareVersions).reverse();
  const docs = await Promise.all(sorted.map((each) => documents().getActivityVersion(owner, name, each)));
  return docs.flatMap((each) => (each ? [{ version: each.version, publishedAt: each.publishedAt }] : []));
}
