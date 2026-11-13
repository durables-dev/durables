import type { UnacceptedSdk } from "./facts";
import type { Recognisable } from "./identify";
import type { Pattern } from "./pattern";

// Markers for the Temporal SDKs Durables recognises but does not accept, so a refusal can
// name the SDK the file is written in.

/** A Java import from the Temporal SDK, such as `import io.temporal.activity.ActivityInterface;`. */
export const javaSdkImport: Pattern = {
  name: "java-sdk-import",
  description:
    "A Java import from the Temporal SDK's io.temporal package, such as import io.temporal.activity.ActivityInterface.",
  regex: /^[ \t]*import[ \t]+(?:static[ \t]+)?io\.temporal\./m,
};

/** A Java activity annotation: `@ActivityInterface` or `@ActivityMethod`. */
export const javaActivityAnnotation: Pattern = {
  name: "java-activity-annotation",
  description:
    "The @ActivityInterface or @ActivityMethod annotation on a Java interface or method.",
  regex: /@Activity(?:Interface|Method)\b/,
};

/** A Go import of a Temporal SDK package, such as `"go.temporal.io/sdk/activity"`. */
export const goSdkImport: Pattern = {
  name: "go-sdk-import",
  description:
    'A Go import of a Temporal SDK package from go.temporal.io/sdk, such as "go.temporal.io/sdk/activity".',
  regex: /"go\.temporal\.io\/sdk(?:\/[\w./-]*)?"/,
};

/** A Go import of the SDK's activity package. */
export const goActivityImport: Pattern = {
  name: "go-activity-import",
  description:
    'A Go import of the Temporal SDK\'s activity package, "go.temporal.io/sdk/activity".',
  regex: /"go\.temporal\.io\/sdk\/activity"/,
};

/** A Go function whose first parameter is a `context.Context`, the shape of a Go activity. */
export const goActivityFunction: Pattern = {
  name: "go-activity-function",
  description:
    "A Go function, or method, whose first parameter is a context.Context, which is how a Go activity is declared.",
  regex:
    /^[ \t]*func[ \t]+(?:\([^)]*\)[ \t]*)?[A-Za-z_]\w*[ \t]*\([ \t]*\w+[ \t]+context\.Context\b/m,
};

/**
 * The SDKs Durables recognises but does not accept. Identification runs over these with the
 * registry's SDKs, so a refusal can name the SDK.
 */
export const unacceptedSdks: readonly Recognisable<UnacceptedSdk>[] = [
  {
    sdk: "Java",
    recognition: {
      sdkMarkers: [javaSdkImport],
      activityMarkers: [javaActivityAnnotation],
      shapeMarkers: [],
    },
  },
  {
    sdk: "Go",
    recognition: {
      sdkMarkers: [goSdkImport],
      activityMarkers: [goActivityImport, goActivityFunction],
      shapeMarkers: [],
    },
  },
];
