import type { UnacceptedSdk } from "./facts";
import type { Recognisable } from "./identify";
import type { Pattern } from "./pattern";

// Markers for the Temporal SDKs Durables recognises but does not accept, so a refusal can
// name the SDK the file is written in.

/** A PHP `use` of the Temporal SDK's namespace, such as `use Temporal\Activity\ActivityInterface;`. */
export const phpSdkUse: Pattern = {
  name: "php-sdk-use",
  description:
    "A PHP use statement for the Temporal SDK's Temporal namespace, such as use Temporal\\Activity\\ActivityInterface.",
  regex: /^[ \t]*use[ \t]+\\?Temporal\\/m,
};

/** A PHP activity attribute or annotation: `ActivityInterface` or `ActivityMethod`. */
export const phpActivityAttribute: Pattern = {
  name: "php-activity-attribute",
  description:
    "The #[ActivityInterface] or #[ActivityMethod] attribute, or the same name as a docblock annotation, on a PHP interface or method.",
  regex: /(?:#\[[ \t]*|@)Activity(?:Interface|Method)\b/,
};

/**
 * The SDKs Durables recognises but does not accept. Identification runs over these with the
 * registry's SDKs, so a refusal can name the SDK.
 */
export const unacceptedSdks: readonly Recognisable<UnacceptedSdk>[] = [
  {
    sdk: "PHP",
    recognition: {
      sdkMarkers: [phpSdkUse],
      activityMarkers: [phpActivityAttribute],
      shapeMarkers: [],
    },
  },
];
