// Written from the POC-4 API map, boundary 2 (POST /activities/detect), and
// widened by the POC-8 API map, boundary 1 (TypeScript and .NET detection).

export type Sdk = "python" | "typescript" | "dotnet";

/** A detected value and the 1-based line in the submitted code it was found on. */
export type Located<T> = { value: T; line: number };

export type InputType = { name: string; type: string; line: number };

export type Detection = {
  sdk: Located<Sdk>;
  activityName: Located<string>;
  inputTypes: InputType[];
  /** Unwrapped: `Promise<T>` and `Task<T>` are stored as `T`, and a bare `Task` as "void". */
  outputType: Located<string>;
  nonRetryableErrorTypes: Located<string>[];
  /** One entry per distinct name, in first-read order. */
  envVars: Located<string>[];
};
