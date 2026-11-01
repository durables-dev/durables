import { describe, expect, test } from "vitest";
import { implementSteps } from "./implement-steps";
import { dotnet, python, pythonCode, typescript } from "./test-versions";

describe("implementSteps", () => {
  test.each([
    [python, ["activities.py", "workflows.py", "worker.py", "start.py"]],
    [typescript, ["activities.ts", "workflows.ts", "worker.ts", "start.ts"]],
    [
      dotnet,
      ["Activities.cs", "ResizeImageWorkflow.cs", "Program.cs", "Starter.cs"],
    ],
  ])("names the four files for the SDK, activity first", (version, names) => {
    const { files } = implementSteps(version);

    expect(files.map((file) => file.name)).toEqual(names);
    expect(files.map((file) => file.role)).toEqual([
      "activity",
      "workflow",
      "worker",
      "starter",
    ]);
  });

  test("the activity file is the published code, byte for byte", () => {
    const [activity] = implementSteps(python).files;

    expect(activity?.code).toBe(pythonCode);
  });

  test("the install command and run commands are the first and last snippets, unchanged", () => {
    const { installCommand, runCommands } = implementSteps(python);

    expect(installCommand).toBe(python.snippets[0]?.code);
    expect(runCommands).toBe(python.snippets[4]?.code);
  });

  test("each file has a line saying what it is, the activity's naming its address", () => {
    const { files } = implementSteps(python);

    expect(files.map((file) => file.description)).toEqual([
      "The activity itself, exactly as published in ddieruf/charge-card@1.0.0.",
      "A minimal workflow that calls the activity.",
      "Runs a worker that registers the workflow and the activity.",
      "Starts one run of the workflow.",
    ]);
  });

  test("with no snippets, only the activity file is left and there is no install or run", () => {
    const result = implementSteps({ ...python, snippets: [] });

    expect(result.files.map((file) => file.name)).toEqual(["activities.py"]);
    expect(result.installCommand).toBeUndefined();
    expect(result.runCommands).toBeUndefined();
  });
});
