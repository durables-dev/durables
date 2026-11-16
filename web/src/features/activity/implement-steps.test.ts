import { describe, expect, test } from "vitest";
import { filesHeading, implementSteps } from "./implement-steps";
import {
  dotnet,
  php,
  python,
  pythonCode,
  typescript,
  type TestVersion,
} from "./test-versions";

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

  test.each([python, typescript, dotnet])(
    "$sdk gives the same steps as before: install first, four files highlighted, run last",
    (version) => {
      const [install, workflow, worker, starter, run] = version.snippets;
      const steps = implementSteps(version);

      expect(steps).toEqual({
        installCommand: install?.code,
        files: [
          {
            role: "activity",
            name: version.activityFileName,
            code: version.code,
            description: `The activity itself, exactly as published in ${version.address}.`,
            inSdkLanguage: true,
          },
          {
            role: "workflow",
            name: workflow?.label,
            code: workflow?.code,
            description: "A minimal workflow that calls the activity.",
            inSdkLanguage: true,
          },
          {
            role: "worker",
            name: worker?.label,
            code: worker?.code,
            description:
              "Runs a worker that registers the workflow and the activity.",
            inSdkLanguage: true,
          },
          {
            role: "starter",
            name: starter?.label,
            code: starter?.code,
            description: "Starts one run of the workflow.",
            inSdkLanguage: true,
          },
        ],
        runCommands: run?.code,
      });
    },
  );

  test("install and run are picked out by their labels, wherever they are", () => {
    const [install, workflow, worker, starter, run] = python.snippets;
    const shuffled: TestVersion = {
      ...python,
      snippets: [workflow, run, worker, install, starter].filter(
        (snippet) => snippet !== undefined,
      ),
    };

    const steps = implementSteps(shuffled);

    expect(steps.installCommand).toBe(install?.code);
    expect(steps.runCommands).toBe(run?.code);
    expect(steps.files.map((file) => file.name)).toEqual([
      "activities.py",
      "workflows.py",
      "worker.py",
      "start.py",
    ]);
    expect(steps.files.map((file) => file.role)).toEqual([
      "activity",
      "workflow",
      "worker",
      "starter",
    ]);
  });

  test("PHP's sixth snippet, after Run, becomes a fifth file with a description naming no SDK, in plain text", () => {
    const steps = implementSteps(php);

    expect(steps.installCommand).toBe(php.snippets[0]?.code);
    expect(steps.runCommands).toBe(php.snippets[4]?.code);
    expect(steps.files.map((file) => file.name)).toEqual([
      "Activities.php",
      "ChargeCardWorkflow.php",
      "worker.php",
      "starter.php",
      ".rr.yaml",
    ]);
    expect(steps.files.map((file) => file.role)).toEqual([
      "activity",
      "workflow",
      "worker",
      "starter",
      "other",
    ]);
    expect(steps.files.map((file) => file.inSdkLanguage)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    const rr = steps.files.at(-1);
    expect(rr?.code).toBe(php.snippets[5]?.code);
    expect(rr?.description).toBe("Another file the worker needs.");
  });

  test("every file after the third generated one is another file the worker needs", () => {
    const extra = [
      { label: "first.extra", code: "a" },
      { label: "second.extra", code: "b" },
    ];
    const steps = implementSteps({
      ...python,
      snippets: [...python.snippets, ...extra],
    });

    expect(steps.files.slice(4)).toEqual([
      {
        role: "other",
        name: "first.extra",
        code: "a",
        description: "Another file the worker needs.",
        inSdkLanguage: false,
      },
      {
        role: "other",
        name: "second.extra",
        code: "b",
        description: "Another file the worker needs.",
        inSdkLanguage: false,
      },
    ]);
  });

  test("a further file's tab is described the same for every SDK, naming no SDK and no file", () => {
    const sdkNames = [
      "Go",
      "Java",
      "Python",
      "TypeScript",
      ".NET",
      "Ruby",
      "PHP",
      "Rust",
    ];
    const extra = { label: "extra.conf", code: "x" };
    const descriptions = [php, python, typescript, dotnet].map(
      (version) =>
        implementSteps({
          ...version,
          snippets: [...version.snippets, extra],
        }).files[4]?.description,
    );

    expect(new Set(descriptions)).toEqual(
      new Set(["Another file the worker needs."]),
    );
    for (const name of [...sdkNames, ".rr.yaml", "extra.conf", "RoadRunner"]) {
      expect(descriptions[0]?.toLowerCase()).not.toContain(name.toLowerCase());
    }
  });

  test("a version with no Run snippet has no run commands, and keeps its install and files", () => {
    const steps = implementSteps({
      ...php,
      snippets: php.snippets.filter((snippet) => snippet.label !== "Run"),
    });

    expect(steps.runCommands).toBeUndefined();
    expect(steps.installCommand).toBe(php.snippets[0]?.code);
    expect(steps.files.map((file) => file.name)).toEqual([
      "Activities.php",
      "ChargeCardWorkflow.php",
      "worker.php",
      "starter.php",
      ".rr.yaml",
    ]);
  });

  test("a version with no Install snippet has no install command, and keeps its files and run", () => {
    const steps = implementSteps({
      ...python,
      snippets: python.snippets.filter(
        (snippet) => snippet.label !== "Install",
      ),
    });

    expect(steps.installCommand).toBeUndefined();
    expect(steps.runCommands).toBe(python.snippets[4]?.code);
    expect(steps.files.map((file) => file.name)).toEqual([
      "activities.py",
      "workflows.py",
      "worker.py",
      "start.py",
    ]);
  });
});

describe("filesHeading", () => {
  test.each([
    [1, "2. Add this file to your project"],
    [4, "2. Add these four files to your project"],
    [5, "2. Add these five files to your project"],
    [12, "2. Add these 12 files to your project"],
  ])("%i files are headed %s", (count, heading) => {
    expect(filesHeading(count)).toBe(heading);
  });
});
