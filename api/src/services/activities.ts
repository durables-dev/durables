import { isActivityAddress } from "../domain/addresses/address.js";
import type { Detector } from "../domain/detection/detector.js";
import { pythonDetector } from "../domain/detection/python.js";
import { buildChecks } from "../domain/patterns/checks.js";
import { PYTHON_IDEMPOTENCY } from "../domain/patterns/rubric.js";
import type { Check, Declarations } from "../model/check.js";
import type { Detection } from "../model/detection.js";

export class BadRequestError extends Error {
  readonly statusCode = 400;
}

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
  return buildChecks(code, declarations, PYTHON_IDEMPOTENCY);
}
