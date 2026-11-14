import { describe, expect, it } from "vitest";
import { unacceptedSdks } from "./unaccepted-sdks";

describe("the unaccepted SDKs", () => {
  it("hold none, now that Go, Java and PHP are accepted", () => {
    expect(unacceptedSdks).toEqual([]);
  });
});
