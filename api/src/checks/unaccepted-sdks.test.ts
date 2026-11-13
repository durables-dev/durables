import { describe, expect, it } from "vitest";
import { matchesAny } from "./pattern";
import { unacceptedSdks } from "./unaccepted-sdks";

const markersFor = (sdk: string) => {
  const found = unacceptedSdks.find((markers) => markers.sdk === sdk);
  if (found === undefined) {
    throw new Error(`No markers for ${sdk}`);
  }
  return found.recognition;
};

describe("unaccepted SDK markers", () => {
  const patterns = unacceptedSdks.flatMap(({ recognition }) => [
    ...recognition.sdkMarkers,
    ...recognition.activityMarkers,
  ]);

  it("are named, unique, documented and stateless", () => {
    const names = patterns.map((pattern) => pattern.name);
    expect(new Set(names).size).toBe(names.length);
    for (const pattern of patterns) {
      expect(pattern.name).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(pattern.description.length).toBeGreaterThan(0);
      expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
    }
  });

  it.each([
    ["Go", '\t"go.temporal.io/sdk/activity"'],
    ["Go", 'import "go.temporal.io/sdk"'],
    ["PHP", "use Temporal\\Activity\\ActivityInterface;"],
  ])("recognise the %s SDK in %s", (sdk, line) => {
    expect(matchesAny(markersFor(sdk).sdkMarkers, line)).toBe(true);
  });

  it.each([
    ["Go", "func Greet(ctx context.Context, name string) (string, error) {"],
    ["Go", "func (a *Activities) Greet(ctx context.Context) error {"],
    ["PHP", "#[ActivityInterface]\ninterface Greeter"],
    ["PHP", " * @ActivityMethod"],
  ])("recognise a %s activity in %s", (sdk, code) => {
    expect(matchesAny(markersFor(sdk).activityMarkers, code)).toBe(true);
  });

  it.each([
    ["Go", '"github.com/example/temporal"'],
    ["PHP", "use App\\Temporal\\Thing;"],
  ])("do not take a lookalike for the %s SDK: %s", (sdk, line) => {
    expect(matchesAny(markersFor(sdk).sdkMarkers, line)).toBe(false);
  });

  it("do not take a Go workflow for an activity", () => {
    const workflow =
      "func GreetWorkflow(ctx workflow.Context, name string) (string, error) {";
    expect(matchesAny(markersFor("Go").activityMarkers, workflow)).toBe(false);
  });
});
