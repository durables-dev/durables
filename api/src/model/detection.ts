// Written from the POC-4 API map, boundary 2 (POST /activities/detect), and
// widened by the POC-8 API map, boundary 1 (TypeScript and .NET detection),
// and the POC-11 API map, boundary 2 (same-file dataclass fields, Python only).

export type Sdk = "python" | "typescript" | "dotnet";

/** A detected value and the 1-based line in the submitted code it was found on. */
export type Located<T> = { value: T; line: number };

/** One top-level `name: type` line of a same-file dataclass. */
export type Field = { name: string; type: string; line: number };

/**
 * The fields of the class a type names. Present only when the type names a
 * `@dataclass` defined in the same file (Python only). `typeLine` is the line
 * of that class's `class` statement.
 */
export type TypeFields = { fields?: Field[]; typeLine?: number };

export type InputType = { name: string; type: string; line: number } & TypeFields;

export type Detection = {
  sdk: Located<Sdk>;
  activityName: Located<string>;
  inputTypes: InputType[];
  /** Unwrapped: `Promise<T>` and `Task<T>` are stored as `T`, and a bare `Task` as "void". */
  outputType: Located<string> & TypeFields;
  nonRetryableErrorTypes: Located<string>[];
  /** One entry per distinct name, in first-read order. */
  envVars: Located<string>[];
};
