import { contributeOriginSchema } from "@/lib/contribute-origin";
import {
  newVersionBaseSchema,
  type NewVersionBase,
} from "@/lib/new-version-entry";
import type { SdkName } from "@/lib/sdk-catalog";
import {
  deprecationReasonSchema,
  listingDetailsSchema,
  whatChangedSchema,
  type ListingDetails,
  type PublishConfirmationKey,
} from "@durables/schemas";
import { z } from "zod";
import {
  checkResultSchema,
  type CheckedFacts,
  type CheckResult,
} from "./check-result";
import { defaultName, defaultTitle } from "./listing-defaults";
import {
  checkVersion,
  replacedByReason,
  suggestVersion,
  versionAllowed,
  type BaseVersion,
} from "./new-version";
import { stepIdSchema, type StepId } from "./steps";

/** The in-progress contribution. Later steps add what they collect. */
export interface Draft {
  /** The steps the publisher has finished, in the order they finished them. */
  finished: StepId[];
  /**
   * Set in new-version mode: the listing a new version is for, and the version it starts
   * from. Absent for a first publish.
   */
  newVersion?: NewVersionBase | undefined;
  /**
   * The page the publisher opened the flow from. Back on the sign-in step returns there. It is
   * kept with the draft so it survives the round trip to a sign-in provider.
   */
  origin?: string | undefined;
  /** The code in the Code step's editor, exactly as pasted. */
  code?: string | undefined;
  /** The latest check of `code`. It goes whenever the code changes or an SDK is declared. */
  check?: CheckResult | undefined;
  /**
   * The SDK the publisher chose for `code`. Checks and publish send it, and the api runs that
   * SDK's detector. It stays while the code is edited, and goes when the editor is emptied.
   */
  declaredSdk?: SdkName | undefined;
  /**
   * The listing details as the publisher entered them. A field the publisher has not edited
   * is absent, and reads as its default (see `draftDetails`). An empty string is a field the
   * publisher cleared.
   */
  details?: DraftDetailsEdits | undefined;
  /**
   * The name publish refused because the publisher already has a listing at that address.
   * The Details step says so under the name while the name is this one.
   */
  usedName?: string | undefined;
  /**
   * The handle publish refused because another account took it after it was chosen. The
   * handle step says so while the handle in its field is this one.
   */
  takenHandle?: string | undefined;
  /**
   * The Review step's confirmations the publisher has checked or unchecked. They vouch for the
   * code, so they are cleared whenever the code changes.
   */
  confirmations?: DraftConfirmationEdits | undefined;
  /** New-version mode: the publisher checked Deprecate {base} on the Review step. */
  deprecateBase?: boolean | undefined;
  /**
   * New-version mode: the deprecation reason as the publisher edited it. Until edited, it
   * reads as "Replaced by {new version}" (see `draftDeprecation`).
   */
  deprecationReason?: string | undefined;
}

/**
 * The fields the Details step edits. A new version adds its number and its What changed note
 * to the listing details.
 */
export type DraftDetailField = keyof ListingDetails | "version" | "whatChanged";

/** The listing details the publisher has edited so far. */
export type DraftDetailsEdits = Partial<
  Record<DraftDetailField, string | undefined>
>;

/** The confirmations the publisher has checked or unchecked so far. */
export type DraftConfirmationEdits = Partial<
  Record<PublishConfirmationKey, boolean | undefined>
>;

/** The six confirmations as the Review step shows them. Unchecked unless checked. */
export type DraftConfirmations = Record<PublishConfirmationKey, boolean>;

/**
 * What the publisher did. A step's form dispatches once it validates. A finished check is
 * for the code it checked, and is dropped if the code has changed since.
 */
export type DraftAction =
  | { type: "stepFinished"; step: StepId }
  | { type: "codeEdited"; code: string }
  | { type: "sdkDeclared"; sdk: SdkName }
  | {
      type: "checkFinished";
      code: string;
      declaredSdk?: SdkName | undefined;
      result: CheckResult;
    }
  | { type: "detailsEdited"; field: DraftDetailField; value: string }
  | { type: "nameUsedAtPublish"; name: string }
  | { type: "handleTakenAtPublish"; handle: string }
  | {
      type: "confirmationToggled";
      confirmation: PublishConfirmationKey;
      checked: boolean;
    }
  | { type: "deprecateBaseToggled"; checked: boolean }
  | { type: "deprecationReasonEdited"; reason: string }
  | { type: "published" };

export const emptyDraft: Draft = { finished: [] };

/** The sessionStorage key the draft is mirrored to, so a reload keeps it. */
export const draftStorageKey = "durables.contribute.draft";

const optionalString = z.string().optional().catch(undefined);

const optionalBoolean = z.boolean().optional().catch(undefined);

const draftSchema = z.object({
  finished: z.array(stepIdSchema),
  // An unreadable base makes the whole draft unreadable. Kept without it, the draft would turn
  // into a first publish holding a new version's details.
  newVersion: newVersionBaseSchema.optional(),
  // An unreadable origin is dropped rather than losing the rest of the draft.
  origin: contributeOriginSchema.optional().catch(undefined),
  code: z.string().optional(),
  // An unreadable check is dropped and the code kept, so the check can run again.
  check: checkResultSchema.optional().catch(undefined),
  // An unreadable declared SDK is dropped, so the api identifies the SDK again.
  declaredSdk: z
    .custom<SdkName>((value) => typeof value === "string" && value !== "")
    .optional()
    .catch(undefined),
  // An unreadable field is dropped, so it reads as its default again.
  details: z
    .object({
      title: optionalString,
      name: optionalString,
      description: optionalString,
      version: optionalString,
      whatChanged: optionalString,
    } satisfies Record<DraftDetailField, z.ZodType>)
    .optional()
    .catch(undefined),
  // An unreadable refused name is dropped, so the message under the name goes.
  usedName: optionalString,
  // An unreadable taken handle is dropped, so the message on the handle step goes.
  takenHandle: optionalString,
  // An unreadable confirmation is dropped, so it reads as unchecked.
  confirmations: z
    .object({
      rights: optionalBoolean,
      mitZero: optionalBoolean,
      noSecrets: optionalBoolean,
      notMalicious: optionalBoolean,
      noResponsibility: optionalBoolean,
      terms: optionalBoolean,
    } satisfies Record<PublishConfirmationKey, z.ZodType>)
    .optional()
    .catch(undefined),
  deprecateBase: optionalBoolean,
  deprecationReason: optionalString,
});

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "stepFinished":
      return draft.finished.includes(action.step)
        ? draft
        : { ...draft, finished: [...draft.finished, action.step] };
    case "codeEdited":
      return action.code === (draft.code ?? "")
        ? draft
        : {
            ...draft,
            code: action.code,
            check: undefined,
            declaredSdk:
              action.code.trim() === "" ? undefined : draft.declaredSdk,
            confirmations: undefined,
          };
    // The previous check was for another SDK, so it goes until the declared SDK's check answers.
    case "sdkDeclared":
      return action.sdk === draft.declaredSdk && draft.check !== undefined
        ? draft
        : { ...draft, declaredSdk: action.sdk, check: undefined };
    case "checkFinished":
      return action.code === draft.code &&
        action.declaredSdk === draft.declaredSdk
        ? { ...draft, check: action.result }
        : draft;
    case "detailsEdited":
      return {
        ...draft,
        details: { ...draft.details, [action.field]: action.value },
      };
    case "nameUsedAtPublish":
      return { ...draft, usedName: action.name };
    // The handle step is unfinished again until another handle is saved. The rest is kept.
    case "handleTakenAtPublish":
      return {
        ...draft,
        finished: draft.finished.filter((step) => step !== "profile"),
        takenHandle: action.handle,
      };
    case "confirmationToggled":
      return {
        ...draft,
        confirmations: {
          ...draft.confirmations,
          [action.confirmation]: action.checked,
        },
      };
    case "deprecateBaseToggled":
      return { ...draft, deprecateBase: action.checked };
    case "deprecationReasonEdited":
      return { ...draft, deprecationReason: action.reason };
    case "published":
      return emptyDraft;
  }
}

/**
 * The listing details to show. A field the publisher has edited keeps their edit, even when
 * they cleared it. Otherwise the title and name default from the accepted activity's name,
 * and follow it when the check changes. The description starts empty.
 *
 * In new-version mode the name is the listing's and can't change, and the title and
 * description start from the base version's. They read as empty until the base is read.
 */
export function draftDetails(draft: Draft, base?: BaseVersion): ListingDetails {
  if (draft.newVersion !== undefined) {
    return {
      title: draft.details?.title ?? base?.title ?? "",
      name: draft.newVersion.name,
      description: draft.details?.description ?? base?.description ?? "",
    };
  }
  const activityName =
    draft.check?.outcome === "accepted" ? draft.check.facts.activity.name : "";
  return {
    title: draft.details?.title ?? defaultTitle(activityName),
    name: draft.details?.name ?? defaultName(activityName),
    description: draft.details?.description ?? "",
  };
}

/** The six confirmations, each unchecked until the publisher checks it. */
export function draftConfirmations(draft: Draft): DraftConfirmations {
  return {
    rights: draft.confirmations?.rights ?? false,
    mitZero: draft.confirmations?.mitZero ?? false,
    noSecrets: draft.confirmations?.noSecrets ?? false,
    notMalicious: draft.confirmations?.notMalicious ?? false,
    noResponsibility: draft.confirmations?.noResponsibility ?? false,
    terms: draft.confirmations?.terms ?? false,
  };
}

/** The pasted code has been checked and accepted. */
export function isAccepted(draft: Draft): boolean {
  return draft.check?.outcome === "accepted";
}

/** The facts of the accepted code. Undefined while the pasted code is not accepted. */
export function draftFacts(draft: Draft): CheckedFacts | undefined {
  return draft.check?.outcome === "accepted" ? draft.check.facts : undefined;
}

/** New-version mode: the number and What changed note as typed. Empty until typed. */
export function draftVersionFields(draft: Draft): {
  version: string;
  whatChanged: string;
} {
  return {
    version: draft.details?.version ?? "",
    whatChanged: draft.details?.whatChanged ?? "",
  };
}

/**
 * New-version mode: whether to deprecate the base, and the reason. Until the publisher edits
 * it, the reason is "Replaced by {new version}", following the number as it is typed.
 */
export function draftDeprecation(draft: Draft): {
  checked: boolean;
  reason: string;
} {
  return {
    checked: draft.deprecateBase ?? false,
    reason:
      draft.deprecationReason ??
      replacedByReason(draftVersionFields(draft).version),
  };
}

/** New-version mode: the base is to be deprecated, and its reason passes the shared rule. */
export function deprecationValid(draft: Draft): boolean {
  const { checked, reason } = draftDeprecation(draft);
  return !checked || deprecationReasonSchema.safeParse(reason).success;
}

/**
 * The listing details pass the shared rules, as Continue on the Details step requires. In
 * new-version mode the number must also be allowed and the What changed note given, and
 * nothing passes until the base has been read.
 */
export function detailsValid(draft: Draft, base?: BaseVersion): boolean {
  if (!listingDetailsSchema.safeParse(draftDetails(draft, base)).success) {
    return false;
  }
  if (draft.newVersion === undefined) return true;
  if (base === undefined) return false;
  const { version, whatChanged } = draftVersionFields(draft);
  const suggestion = suggestVersion(base, draftFacts(draft));
  return (
    versionAllowed(checkVersion(version, base, suggestion)) &&
    whatChangedSchema.safeParse(whatChanged).success
  );
}

/**
 * The steps the draft has finished. Code is finished while the pasted code is accepted, and
 * at no other time. Details is finished once the publisher continued from it, and only while
 * the details still pass the shared rules.
 */
export function draftFinished(draft: Draft, base?: BaseVersion): StepId[] {
  const others = draft.finished.filter(
    (step) =>
      step !== "code" && (step !== "details" || detailsValid(draft, base)),
  );
  return isAccepted(draft) ? [...others, "code"] : others;
}

/**
 * The draft as the flow opens: the kept draft, with the page the flow was opened from when the
 * link that opened it named one. Without one, the kept origin stays, as after a sign-in
 * provider sends the publisher back.
 *
 * A link that names a base version starts a new draft in new-version mode, with the code
 * blank. A link into the flow that names a page but no base starts a first publish: a kept
 * new-version draft is set aside for an empty one.
 */
export function enterDraft(
  draft: Draft,
  origin: string | undefined,
  newVersion?: NewVersionBase,
): Draft {
  if (newVersion !== undefined) {
    return {
      finished: [],
      newVersion,
      ...(origin === undefined ? {} : { origin }),
    };
  }
  if (origin === undefined) return draft;
  return draft.newVersion === undefined
    ? { ...draft, origin }
    : { ...emptyDraft, origin };
}

/**
 * The browser session's storage, or undefined when the browser does not allow it. Reading
 * `sessionStorage` itself throws when storage is turned off.
 */
export function sessionStorageIfAvailable(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * The draft kept in the browser session. An empty draft when none is kept, it is unreadable,
 * or the storage cannot be read.
 */
export function readDraft(
  storage: Pick<Storage, "getItem"> | undefined,
): Draft {
  try {
    const stored = storage?.getItem(draftStorageKey) ?? null;
    if (stored === null) return emptyDraft;
    const parsed = draftSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) return emptyDraft;
    // A check belongs to the code it checked. With no code kept, it is dropped.
    const draft = parsed.data;
    return draft.check !== undefined && !draft.code
      ? { ...draft, check: undefined }
      : draft;
  } catch {
    return emptyDraft;
  }
}

/**
 * Keeps the draft in the browser session. When the storage cannot be written, the draft
 * lives on in the page without it.
 */
export function writeDraft(
  storage: Pick<Storage, "setItem"> | undefined,
  draft: Draft,
): void {
  try {
    storage?.setItem(draftStorageKey, JSON.stringify(draft));
  } catch {
    // Full or refused storage: a reload starts the draft again, and nothing else is lost.
  }
}
