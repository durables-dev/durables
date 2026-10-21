/**
 * The largest pasted file Durables checks or publishes, in bytes of UTF-8: 100 KB.
 * The one place the limit is set. Publishing imports it from here.
 */
export const MAX_CODE_BYTES = 100 * 1024;

const encoder = new TextEncoder();

/** The code's size in bytes of UTF-8, which is what the limit counts. */
export const codeByteLength = (code: string) => encoder.encode(code).byteLength;

/** Whether the code fits the limit. Exactly the limit fits. */
export const isWithinSizeLimit = (code: string) =>
  codeByteLength(code) <= MAX_CODE_BYTES;
