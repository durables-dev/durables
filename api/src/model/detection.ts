// Written from the POC-4 API map, boundary 2 (POST /activities/detect).

export type Sdk = "python";

/** A detected value and the 1-based line in the submitted code it was found on. */
export type Located<T> = { value: T; line: number };

export type InputType = { name: string; type: string; line: number };

export type Detection = {
  sdk: Located<Sdk>;
  activityName: Located<string>;
  inputTypes: InputType[];
  outputType: Located<string>;
  nonRetryableErrorTypes: Located<string>[];
  envVars: Located<string>[];
};
