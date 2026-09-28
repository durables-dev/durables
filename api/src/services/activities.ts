import { findAccount } from "../db/accounts-repository.js";
import { insertOwnership } from "../db/ownership-repository.js";
import { formatActivityAddress, isActivityAddress, parseActivityAddress } from "../domain/addresses/address.js";
import { toKebabCase } from "../domain/addresses/names.js";
import type { Detector } from "../domain/detection/detector.js";
import { pythonDetector } from "../domain/detection/python.js";
import { buildChecks } from "../domain/patterns/checks.js";
import { PYTHON_IDEMPOTENCY } from "../domain/patterns/rubric.js";
import { findMissingHeadings } from "../domain/readme/readme-template.js";
import { generatePythonSnippets } from "../domain/snippets/python-snippets.js";
import { FIRST_VERSION, highestVersion } from "../domain/versioning/semver.js";
import type { ActivityVersion, PublishRequest, PublishResult } from "../model/activity-version.js";
import type { Check, Declarations } from "../model/check.js";
import type { Detection } from "../model/detection.js";
import type { Listing } from "../model/listing.js";
import { VersionExistsError } from "../storage/document-store.js";
import { currentAccount } from "./accounts.js";
import { documents } from "./documents.js";
import { BadRequestError, ServiceError } from "./errors.js";

// POC-SHORTCUT: SC-003
function detectorFor(_code: string): Detector {
  return pythonDetector;
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
  return buildChecks(code, declarations, detectActivity(code), PYTHON_IDEMPOTENCY);
}

/**
 * Publishes the first version of an activity. Detection and the pattern check
 * are re-run here, so nothing stored comes from the client's own results. The
 * listing name is the detected activity name in kebab-case, and the owner is
 * the signed-in user.
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
  const version = FIRST_VERSION;
  if ((await documents().listActivityVersions(owner.handle, name)).length > 0) {
    throw new ServiceError(409, `${formatActivityAddress(owner.handle, name)} is already published. Republishing arrives with step 13.`);
  }

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
  const resolved = version ?? highestVersion(await documents().listActivityVersions(owner, name));
  const doc = resolved ? await documents().getActivityVersion(owner, name, resolved) : null;
  if (!doc) throw new ServiceError(404, `${formatActivityAddress(owner, name, version)} is not published.`);

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
    snippets: generatePythonSnippets(doc),
    configuration: doc.declarations.envVars.map(({ name: envName, purpose }) => ({
      name: envName,
      purpose,
      line: detectedLines.get(envName) ?? 0,
    })),
    readme: doc.readme,
    checks: doc.checks,
  };
}
