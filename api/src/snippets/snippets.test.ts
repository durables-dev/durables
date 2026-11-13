import { describe, expect, it } from "vitest";
import type { AcceptedSdk, FactValues } from "../checks/facts";
import { checkCode } from "../checks/pipeline";
import { registeredSdks, sdkRegistry } from "../sdks/registry";
import { sdks } from "../sdks/sdk-list";
import type { Address, Snippet } from "../storage/version-document";
import { installLabel, runLabel } from "./labels";
import { generateSnippets } from "./snippets";

const address: Address = {
  handle: "kris",
  name: "charge-card",
  version: "1.0.0",
};

/** Facts as detection reports them, with the given changes. */
const factsFor = (
  sdk: AcceptedSdk,
  changes: Partial<FactValues> = {},
): FactValues => ({
  sdk,
  activity: {
    name: {
      Python: "charge_card",
      TypeScript: "chargeCard",
      ".NET": "ChargeCardAsync",
      PHP: "chargeCard",
    }[sdk],
    line: 1,
  },
  input: "ChargeRequest",
  output: "ChargeResult",
  runsAs: sdk === "Python" || sdk === "PHP" ? "sync" : "async",
  nonRetryableErrors: [],
  configurationRead: [{ name: "STRIPE_API_KEY", line: 4 }],
  dependencies: [
    { name: sdk === ".NET" || sdk === "PHP" ? "Stripe" : "stripe", line: 2 },
  ],
  heartbeats: [],
  ...changes,
});

/** The file names of the workflow, worker and starter, for an activity in the given SDK. */
const fileLabels = (sdk: AcceptedSdk, workflowClass = "ChargeCardWorkflow") =>
  ({
    Python: ["workflows.py", "worker.py", "start.py"],
    TypeScript: ["workflows.ts", "worker.ts", "start.ts"],
    ".NET": [`${workflowClass}.cs`, "Program.cs", "Starter.cs"],
    PHP: [`${workflowClass}.php`, "worker.php", "starter.php"],
  })[sdk];

/** The snippets an SDK sends after the run commands: PHP's RoadRunner config. */
const afterRun = (sdk: AcceptedSdk) => (sdk === "PHP" ? [".rr.yaml"] : []);

/** The snippet with the label. Fails the test when there is none. */
const snippet = (snippets: readonly Snippet[], label: string) => {
  const found = snippets.find((entry) => entry.label === label);
  if (found === undefined) {
    throw new Error(`No snippet labelled ${label}`);
  }
  return found.code;
};

/**
 * The workflow, worker and starter files, in that order: every snippet but the install and run
 * commands and PHP's RoadRunner config.
 */
const files = (snippets: readonly Snippet[]) =>
  snippets.filter(
    ({ label }) => ![installLabel, runLabel, ".rr.yaml"].includes(label),
  );

/**
 * The first bracket that doesn't close, or closes the wrong opener, outside strings and
 * comments. Null when every bracket is matched.
 */
const unbalancedBracket = (code: string, lineComment: string) => {
  const closers: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const open: string[] = [];
  let index = 0;
  while (index < code.length) {
    const character = code.charAt(index);
    if (code.startsWith(lineComment, index)) {
      index = code.indexOf("\n", index);
      if (index === -1) {
        break;
      }
    } else if (code.startsWith("/*", index) && lineComment === "//") {
      index = code.indexOf("*/", index) + 2;
    } else if (`"'\``.includes(character)) {
      index++;
      while (index < code.length && code.charAt(index) !== character) {
        index += code.charAt(index) === "\\" ? 2 : 1;
      }
    } else if (character in closers) {
      open.push(closers[character] ?? "");
    } else if (")]}".includes(character) && open.pop() !== character) {
      return `${character} at ${index}`;
    }
    index++;
  }
  return open.length === 0 ? null : `unclosed ${open.join("")}`;
};

const lineComments: Record<AcceptedSdk, string> = {
  Python: "#",
  TypeScript: "//",
  ".NET": "//",
  PHP: "//",
};

/** The generated text for each SDK's fixture activity, `factsFor(sdk)` at `address`. */
const expectedSnippets: Record<AcceptedSdk, Snippet[]> = {
  Python: [
    {
      label: "Install",
      code: [
        "pip install temporalio",
        "# Also install the PyPI packages that provide: stripe",
      ].join("\n"),
    },
    {
      label: "workflows.py",
      code: [
        "from datetime import timedelta",
        "",
        "from temporalio import workflow",
        "",
        "with workflow.unsafe.imports_passed_through():",
        "    from activities import ChargeRequest, ChargeResult, charge_card",
        "",
        "",
        "@workflow.defn",
        "class ChargeCardWorkflow:",
        "    @workflow.run",
        "    async def run(self, input: ChargeRequest) -> ChargeResult:",
        "        return await workflow.execute_activity(",
        "            charge_card,",
        "            input,",
        "            # Temporal requires a start-to-close timeout. Set it for your activity.",
        "            start_to_close_timeout=timedelta(seconds=30),",
        "        )",
      ].join("\n"),
    },
    {
      label: "worker.py",
      code: [
        "import asyncio",
        "from concurrent.futures import ThreadPoolExecutor",
        "",
        "from temporalio.client import Client",
        "from temporalio.worker import Worker",
        "",
        "from activities import charge_card",
        "from workflows import ChargeCardWorkflow",
        "",
        "",
        "async def main():",
        '    client = await Client.connect("localhost:7233")',
        "    worker = Worker(",
        "        client,",
        '        task_queue="charge-card",',
        "        workflows=[ChargeCardWorkflow],",
        "        activities=[charge_card],",
        "        activity_executor=ThreadPoolExecutor(max_workers=10),",
        "    )",
        "    await worker.run()",
        "",
        "",
        "asyncio.run(main())",
      ].join("\n"),
    },
    {
      label: "start.py",
      code: [
        "import asyncio",
        "import uuid",
        "",
        "from temporalio.client import Client",
        "",
        "from activities import ChargeRequest",
        "from workflows import ChargeCardWorkflow",
        "",
        "",
        "async def main():",
        '    client = await Client.connect("localhost:7233")',
        "    # Fill in the input to pass to charge_card.",
        "    input: ChargeRequest = ...",
        "    result = await client.execute_workflow(",
        "        ChargeCardWorkflow.run,",
        "        input,",
        '        id=f"charge-card-{uuid.uuid4()}",',
        '        task_queue="charge-card",',
        "    )",
        "    print(result)",
        "",
        "",
        "asyncio.run(main())",
      ].join("\n"),
    },
    {
      label: "Run",
      code: [
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "python worker.py",
        "python start.py",
      ].join("\n"),
    },
  ],
  TypeScript: [
    {
      label: "Install",
      code: [
        "npm install @temporalio/activity @temporalio/client @temporalio/worker @temporalio/workflow stripe",
      ].join("\n"),
    },
    {
      label: "workflows.ts",
      code: [
        'import { proxyActivities } from "@temporalio/workflow";',
        "",
        'import type * as activities from "./activities";',
        'import type { ChargeRequest, ChargeResult } from "./activities";',
        "",
        "const proxies = proxyActivities<typeof activities>({",
        "    // Temporal requires a start-to-close timeout. Set it for your activity.",
        '    startToCloseTimeout: "30 seconds",',
        "});",
        "",
        "export async function chargeCardWorkflow(input: ChargeRequest): Promise<ChargeResult> {",
        "    return await proxies.chargeCard(input);",
        "}",
      ].join("\n"),
    },
    {
      label: "worker.ts",
      code: [
        'import { NativeConnection, Worker } from "@temporalio/worker";',
        "",
        'import * as activities from "./activities";',
        "",
        "async function run() {",
        '    const connection = await NativeConnection.connect({ address: "localhost:7233" });',
        "    const worker = await Worker.create({",
        "        connection,",
        '        taskQueue: "charge-card",',
        '        workflowsPath: require.resolve("./workflows"),',
        "        activities: { chargeCard: activities.chargeCard },",
        "    });",
        "    await worker.run();",
        "}",
        "",
        "run().catch((err: unknown) => {",
        "    console.error(err);",
        "    process.exit(1);",
        "});",
      ].join("\n"),
    },
    {
      label: "start.ts",
      code: [
        'import { Client, Connection } from "@temporalio/client";',
        "",
        'import type { ChargeRequest } from "./activities";',
        'import { chargeCardWorkflow } from "./workflows";',
        "",
        "async function run() {",
        '    const connection = await Connection.connect({ address: "localhost:7233" });',
        "    const client = new Client({ connection });",
        "    // Fill in the input to pass to chargeCard.",
        "    const input = {} as ChargeRequest;",
        "    const result = await client.workflow.execute(chargeCardWorkflow, {",
        "        args: [input],",
        '        taskQueue: "charge-card",',
        "        workflowId: `charge-card-${crypto.randomUUID()}`,",
        "    });",
        "    console.log(result);",
        "}",
        "",
        "run().catch((err: unknown) => {",
        "    console.error(err);",
        "    process.exit(1);",
        "});",
      ].join("\n"),
    },
    {
      label: "Run",
      code: [
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "npx tsx worker.ts",
        "npx tsx start.ts",
      ].join("\n"),
    },
  ],
  ".NET": [
    {
      label: "Install",
      code: [
        "dotnet new console --output charge-card",
        "cd charge-card",
        "dotnet add package Temporalio",
        "# Also add the NuGet packages that provide: Stripe",
      ].join("\n"),
    },
    {
      label: "ChargeCardWorkflow.cs",
      code: [
        "using Temporalio.Workflows;",
        "",
        "// Activities stands in for the class that declares ChargeCardAsync. Change it to your",
        "// class's name, and add a using directive if that class is in a namespace.",
        "[Workflow]",
        "public class ChargeCardWorkflow",
        "{",
        "    [WorkflowRun]",
        "    public async Task<ChargeResult> RunAsync(ChargeRequest input)",
        "    {",
        "        return await Workflow.ExecuteActivityAsync(",
        "            (Activities activities) => activities.ChargeCardAsync(input),",
        "            new ActivityOptions",
        "            {",
        "                // Temporal requires a start-to-close timeout. Set it for your activity.",
        "                StartToCloseTimeout = TimeSpan.FromSeconds(30),",
        "            });",
        "    }",
        "}",
      ].join("\n"),
    },
    {
      label: "Program.cs",
      code: [
        "using Temporalio.Client;",
        "using Temporalio.Worker;",
        "",
        'if (args.FirstOrDefault() == "start")',
        "{",
        "    await Starter.RunAsync();",
        "    return;",
        "}",
        "",
        'var client = await TemporalClient.ConnectAsync(new("localhost:7233"));',
        "// Activities stands in for the class that declares ChargeCardAsync. Change it to your",
        "// class's name, and add a using directive if that class is in a namespace.",
        "var activities = new Activities();",
        "using var worker = new TemporalWorker(",
        "    client,",
        '    new TemporalWorkerOptions("charge-card")',
        "        .AddActivity(activities.ChargeCardAsync)",
        "        .AddWorkflow<ChargeCardWorkflow>());",
        "",
        "using var cancellation = new CancellationTokenSource();",
        "Console.CancelKeyPress += (_, eventArgs) =>",
        "{",
        "    eventArgs.Cancel = true;",
        "    cancellation.Cancel();",
        "};",
        "try",
        "{",
        "    await worker.ExecuteAsync(cancellation.Token);",
        "}",
        "catch (OperationCanceledException)",
        "{",
        "}",
      ].join("\n"),
    },
    {
      label: "Starter.cs",
      code: [
        "using Temporalio.Client;",
        "",
        "public static class Starter",
        "{",
        "    public static async Task RunAsync()",
        "    {",
        '        var client = await TemporalClient.ConnectAsync(new("localhost:7233"));',
        "        // Fill in the input to pass to ChargeCardAsync.",
        "        ChargeRequest input = default!;",
        "        var result = await client.ExecuteWorkflowAsync(",
        "            (ChargeCardWorkflow workflow) => workflow.RunAsync(input),",
        '            new(id: $"charge-card-{Guid.NewGuid()}", taskQueue: "charge-card"));',
        "        Console.WriteLine(result);",
        "    }",
        "}",
      ].join("\n"),
    },
    {
      label: "Run",
      code: [
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "dotnet run",
        "dotnet run -- start",
      ].join("\n"),
    },
  ],
  PHP: [
    {
      label: "Install",
      code: [
        "composer require temporal/sdk",
        "./vendor/bin/rr get",
        "# RoadRunner needs PHP's grpc extension. Install it with: pecl install grpc",
        "# Also composer require the packages that provide: Stripe",
      ].join("\n"),
    },
    {
      label: "ChargeCardWorkflow.php",
      code: [
        "<?php",
        "",
        "declare(strict_types=1);",
        "",
        "use Temporal\\Activity\\ActivityOptions;",
        "use Temporal\\Workflow;",
        "use Temporal\\Workflow\\WorkflowInterface;",
        "use Temporal\\Workflow\\WorkflowMethod;",
        "",
        "// Activities stands in for the interface or class marked #[ActivityInterface] that declares",
        "// chargeCard. Change it to that name, with its namespace if it has one.",
        "#[WorkflowInterface]",
        "class ChargeCardWorkflow",
        "{",
        "    #[WorkflowMethod]",
        "    public function run(ChargeRequest $input)",
        "    {",
        "        $activities = Workflow::newActivityStub(",
        "            Activities::class,",
        "            // Temporal requires a start-to-close timeout. Set it for your activity.",
        "            ActivityOptions::new()->withStartToCloseTimeout(30),",
        "        );",
        "",
        "        return yield $activities->chargeCard($input);",
        "    }",
        "}",
      ].join("\n"),
    },
    {
      label: "worker.php",
      code: [
        "<?php",
        "",
        "declare(strict_types=1);",
        "",
        "use Temporal\\WorkerFactory;",
        "",
        "ini_set('display_errors', 'stderr');",
        "require 'vendor/autoload.php';",
        "require 'Activities.php';",
        "require 'ChargeCardWorkflow.php';",
        "",
        "$factory = WorkerFactory::create();",
        "$worker = $factory->newWorker('charge-card');",
        "",
        "$worker->registerWorkflowTypes(ChargeCardWorkflow::class);",
        "// Activities stands in for the class that implements chargeCard. Change it to your",
        "// class's name, with its namespace if it has one.",
        "$worker->registerActivity(Activities::class);",
        "",
        "$factory->run();",
      ].join("\n"),
    },
    {
      label: "starter.php",
      code: [
        "<?php",
        "",
        "declare(strict_types=1);",
        "",
        "use Temporal\\Client\\GRPC\\ServiceClient;",
        "use Temporal\\Client\\WorkflowClient;",
        "use Temporal\\Client\\WorkflowOptions;",
        "",
        "ini_set('display_errors', 'stderr');",
        "require 'vendor/autoload.php';",
        "require 'ChargeCardWorkflow.php';",
        "",
        "$client = new WorkflowClient(ServiceClient::create('localhost:7233'));",
        "$workflow = $client->newWorkflowStub(",
        "    ChargeCardWorkflow::class,",
        "    WorkflowOptions::new()",
        "        ->withTaskQueue('charge-card')",
        "        ->withWorkflowId('charge-card-' . uniqid()),",
        ");",
        "",
        "// Fill in the ChargeRequest to pass to chargeCard.",
        "$input = null;",
        "$result = $workflow->run($input);",
        "var_dump($result);",
      ].join("\n"),
    },
    {
      label: "Run",
      code: [
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "./rr serve",
        "php starter.php",
      ].join("\n"),
    },
    {
      label: ".rr.yaml",
      code: [
        'version: "3"',
        "rpc:",
        "    listen: tcp://127.0.0.1:6001",
        "server:",
        '    command: "php worker.php"',
        "temporal:",
        '    address: "127.0.0.1:7233"',
        "logs:",
        "    level: info",
      ].join("\n"),
    },
  ],
};

describe("generateSnippets", () => {
  describe("criterion 1: each file names the activity and passes its input type", () => {
    it.each(sdks)(
      "gives %s the install command, three files and the run commands, in order",
      (sdk) => {
        expect(
          generateSnippets(factsFor(sdk), address).map(({ label }) => label),
        ).toEqual([
          installLabel,
          ...fileLabels(sdk),
          runLabel,
          ...afterRun(sdk),
        ]);
      },
    );

    it.each(sdks)("names the activity in every %s file", (sdk) => {
      const facts = factsFor(sdk);
      for (const { code } of files(generateSnippets(facts, address))) {
        expect(code).toContain(facts.activity.name);
      }
    });

    it("passes a Python activity its input type", () => {
      const snippets = generateSnippets(factsFor("Python"), address);
      const workflow = snippet(snippets, "workflows.py");
      expect(workflow).toContain(
        "from activities import ChargeRequest, ChargeResult, charge_card",
      );
      expect(workflow).toContain(
        "async def run(self, input: ChargeRequest) -> ChargeResult:",
      );
      expect(workflow).toContain(
        "            charge_card,\n            input,\n",
      );
      expect(snippet(snippets, "start.py")).toContain(
        "    input: ChargeRequest = ...\n",
      );
      expect(snippet(snippets, "worker.py")).toContain(
        "        activities=[charge_card],\n",
      );
    });

    it("passes a TypeScript activity its input type", () => {
      const snippets = generateSnippets(factsFor("TypeScript"), address);
      const workflow = snippet(snippets, "workflows.ts");
      expect(workflow).toContain(
        'import type { ChargeRequest, ChargeResult } from "./activities";',
      );
      expect(workflow).toContain(
        "export async function chargeCardWorkflow(input: ChargeRequest): Promise<ChargeResult> {\n    return await proxies.chargeCard(input);\n}",
      );
      const starter = snippet(snippets, "start.ts");
      expect(starter).toContain(
        'import type { ChargeRequest } from "./activities";',
      );
      expect(starter).toContain("    const input = {} as ChargeRequest;\n");
      expect(starter).toContain("        args: [input],\n");
      expect(snippet(snippets, "worker.ts")).toContain(
        "        activities: { chargeCard: activities.chargeCard },\n",
      );
    });

    it("passes a .NET activity its input type", () => {
      const snippets = generateSnippets(factsFor(".NET"), address);
      const workflow = snippet(snippets, "ChargeCardWorkflow.cs");
      expect(workflow).toContain(
        "    public async Task<ChargeResult> RunAsync(ChargeRequest input)\n",
      );
      expect(workflow).toContain(
        "            (Activities activities) => activities.ChargeCardAsync(input),\n",
      );
      expect(snippet(snippets, "Starter.cs")).toContain(
        "        ChargeRequest input = default!;\n",
      );
      expect(snippet(snippets, "Program.cs")).toContain(
        "        .AddActivity(activities.ChargeCardAsync)\n",
      );
    });

    it("imports the names a Python input type uses, leaving out Python's own", () => {
      const snippets = generateSnippets(
        factsFor("Python", {
          input: "list[models.Charge] | None",
          output: "str",
        }),
        address,
      );
      expect(snippet(snippets, "workflows.py")).toContain(
        "    from activities import charge_card, models\n",
      );
      expect(snippet(snippets, "workflows.py")).toContain(
        "async def run(self, input: list[models.Charge] | None) -> str:",
      );
      expect(snippet(snippets, "start.py")).toContain(
        "from activities import models\n",
      );
    });

    it("leaves out the import line when a TypeScript input type is TypeScript's own", () => {
      const snippets = generateSnippets(
        factsFor("TypeScript", {
          input: "Record<string, number>",
          output: null,
        }),
        address,
      );
      expect(snippet(snippets, "start.ts")).not.toContain("import type");
      expect(snippet(snippets, "workflows.ts")).not.toContain("import type {");
      expect(snippet(snippets, "workflows.ts")).toContain(
        "export async function chargeCardWorkflow(input: Record<string, number>) {",
      );
    });

    it("installs the Temporal SDK and each detected dependency", () => {
      expect(
        snippet(generateSnippets(factsFor("Python"), address), installLabel),
      ).toBe(
        "pip install temporalio\n# Also install the PyPI packages that provide: stripe",
      );
      expect(
        snippet(
          generateSnippets(factsFor("TypeScript"), address),
          installLabel,
        ),
      ).toBe(
        "npm install @temporalio/activity @temporalio/client @temporalio/worker @temporalio/workflow stripe",
      );
      expect(
        snippet(generateSnippets(factsFor(".NET"), address), installLabel),
      ).toBe(
        "dotnet new console --output charge-card\ncd charge-card\ndotnet add package Temporalio\n# Also add the NuGet packages that provide: Stripe",
      );
    });

    it("never installs a Python import by its name, which PyPI may give to another package", () => {
      expect(
        snippet(
          generateSnippets(
            factsFor("Python", {
              dependencies: [
                { name: "yaml", line: 1 },
                { name: "google", line: 2 },
              ],
            }),
            address,
          ),
          installLabel,
        ),
      ).toBe(
        "pip install temporalio\n# Also install the PyPI packages that provide: yaml, google",
      );
      expect(
        snippet(
          generateSnippets(factsFor("Python", { dependencies: [] }), address),
          installLabel,
        ),
      ).toBe("pip install temporalio");
    });

    it("exports each environment variable the activity reads before running", () => {
      expect(
        snippet(generateSnippets(factsFor("Python"), address), runLabel),
      ).toBe(
        "temporal server start-dev\nexport STRIPE_API_KEY=...\npython worker.py\npython start.py",
      );
      expect(
        snippet(
          generateSnippets(
            factsFor(".NET", { configurationRead: [] }),
            address,
          ),
          runLabel,
        ),
      ).toBe("temporal server start-dev\ndotnet run\ndotnet run -- start");
    });

    it("uses the address's name as the task queue and workflow ID prefix", () => {
      const starter = snippet(
        generateSnippets(factsFor("Python"), address),
        "start.py",
      );
      expect(starter).toContain('        id=f"charge-card-{uuid.uuid4()}",\n');
      expect(starter).toContain('        task_queue="charge-card",\n');
    });

    it("gives a synchronous Python activity a thread pool, and an async one none", () => {
      const worker = (runsAs: FactValues["runsAs"]) =>
        snippet(
          generateSnippets(factsFor("Python", { runsAs }), address),
          "worker.py",
        );
      expect(worker("sync")).toContain(
        "        activity_executor=ThreadPoolExecutor(max_workers=10),\n",
      );
      expect(worker("async")).not.toContain("ThreadPoolExecutor");
    });

    it.each(sdks)("uses 4-space indentation in every %s snippet", (sdk) => {
      for (const { code } of generateSnippets(factsFor(sdk), address)) {
        for (const line of code.split("\n")) {
          const indent = /^\s*/.exec(line)?.[0] ?? "";
          expect(indent).not.toContain("\t");
          expect(indent.length % 4).toBe(0);
        }
      }
    });
  });

  describe("criterion 2: a null input gets a typed placeholder", () => {
    it("passes the Python arguments as a typed list the developer fills in", () => {
      const snippets = generateSnippets(
        factsFor("Python", { input: null }),
        address,
      );
      const workflow = snippet(snippets, "workflows.py");
      expect(workflow).toContain("from typing import Any\n");
      expect(workflow).toContain("async def run(self, args: list[Any])");
      expect(workflow).toContain(
        "        # Detection couldn't read what charge_card takes. Fill in its arguments,\n",
      );
      expect(workflow).toContain("            args=args,\n");
      expect(workflow).toContain(
        "    from activities import ChargeResult, charge_card\n",
      );
      const starter = snippet(snippets, "start.py");
      expect(starter).toContain(
        "    # Fill in the arguments charge_card takes, in order.\n    args: list[Any] = []\n",
      );
      expect(starter).not.toContain("from activities import");
    });

    it("types the TypeScript arguments from the activity and asks for them in start.ts", () => {
      const snippets = generateSnippets(
        factsFor("TypeScript", { input: null }),
        address,
      );
      const workflow = snippet(snippets, "workflows.ts");
      expect(workflow).toContain(
        "    ...args: Parameters<typeof activities.chargeCard>\n",
      );
      expect(workflow).toContain(
        "    return await proxies.chargeCard(...args);",
      );
      expect(workflow).toContain(
        "// Detection couldn't read what chargeCard takes",
      );
      const starter = snippet(snippets, "start.ts");
      expect(starter).toContain(
        "    // Fill in the arguments chargeCard takes, in order.\n    const args = [] as unknown as Parameters<typeof chargeCardWorkflow>;\n",
      );
      expect(starter).not.toContain("import type");
    });

    it("passes the .NET activity an object? input the developer changes", () => {
      const snippets = generateSnippets(
        factsFor(".NET", { input: null }),
        address,
      );
      const workflow = snippet(snippets, "ChargeCardWorkflow.cs");
      expect(workflow).toContain("RunAsync(object? input)");
      expect(workflow).toContain(
        "        // Detection couldn't read what ChargeCardAsync takes. Change object? to its input\n",
      );
      expect(workflow).toContain("activities.ChargeCardAsync(input),");
      expect(snippet(snippets, "Starter.cs")).toContain(
        "        // Fill in the arguments ChargeCardAsync takes",
      );
      expect(snippet(snippets, "Starter.cs")).toContain(
        "        object? input = null;\n",
      );
    });

    it.each(sdks)(
      "keeps every %s file's brackets matched with a null input",
      (sdk) => {
        for (const { code } of files(
          generateSnippets(factsFor(sdk, { input: null }), address),
        )) {
          expect(unbalancedBracket(code, lineComments[sdk])).toBeNull();
        }
      },
    );

    it.each(sdks)(
      "keeps every %s file's brackets matched with a known input",
      (sdk) => {
        for (const { code } of files(
          generateSnippets(factsFor(sdk), address),
        )) {
          expect(unbalancedBracket(code, lineComments[sdk])).toBeNull();
        }
      },
    );

    it("has a bracket check that finds an unmatched bracket", () => {
      expect(unbalancedBracket("call(a, [b)", "#")).not.toBeNull();
      expect(unbalancedBracket("call(a", "//")).not.toBeNull();
      expect(unbalancedBracket('call("(") # (', "#")).toBeNull();
    });

    it("leaves out the result when a .NET activity has no output", () => {
      const snippets = generateSnippets(
        factsFor(".NET", { input: null, output: null }),
        address,
      );
      expect(snippet(snippets, "ChargeCardWorkflow.cs")).toContain(
        "    public async Task RunAsync(object? input)\n    {\n",
      );
      expect(snippet(snippets, "ChargeCardWorkflow.cs")).toContain(
        "        await Workflow.ExecuteActivityAsync(",
      );
      expect(snippet(snippets, "Starter.cs")).not.toContain("result");
    });
  });

  describe("criterion 3: the same input gives the same output", () => {
    it.each(sdks)("generates %s snippets identically twice", (sdk) => {
      const facts = factsFor(sdk, { heartbeats: [{ line: 3 }] });
      expect(generateSnippets(facts, address)).toEqual(
        generateSnippets(structuredClone(facts), { ...address }),
      );
    });

    it.each(sdks)(
      "generates %s snippets identically twice with a null input",
      (sdk) => {
        const facts = factsFor(sdk, { input: null });
        expect(generateSnippets(facts, address)).toEqual(
          generateSnippets(facts, address),
        );
      },
    );

    it("doesn't change the facts it is given", () => {
      const facts = factsFor("Python");
      const before = structuredClone(facts);
      generateSnippets(facts, address);
      expect(facts).toEqual(before);
    });
  });

  describe("criterion 4: names that need escaping stay valid", () => {
    it("reaches a TypeScript activity named with a reserved word only as a member", () => {
      const snippets = generateSnippets(
        factsFor("TypeScript", { activity: { name: "delete", line: 1 } }),
        address,
      );
      const workflow = snippet(snippets, "workflows.ts");
      expect(workflow).toContain("return await proxies.delete(input);");
      expect(workflow).toContain("export async function deleteWorkflow(");
      expect(snippet(snippets, "worker.ts")).toContain(
        "activities: { delete: activities.delete },",
      );
      expect(snippet(snippets, "start.ts")).toContain(
        'import { deleteWorkflow } from "./workflows";',
      );
      for (const { code } of files(snippets)) {
        expect(code).not.toMatch(/\{ delete \}|const delete|function delete\(/);
      }
    });

    it("keeps a TypeScript activity name holding $ intact", () => {
      const snippets = generateSnippets(
        factsFor("TypeScript", { activity: { name: "$charge", line: 1 } }),
        address,
      );
      expect(snippet(snippets, "workflows.ts")).toContain(
        "export async function $chargeWorkflow(input: ChargeRequest)",
      );
    });

    it("starts a Python workflow class with a letter when the activity name doesn't give one", () => {
      const workflow = (name: string) =>
        snippet(
          generateSnippets(
            factsFor("Python", { activity: { name, line: 1 } }),
            address,
          ),
          "workflows.py",
        );
      expect(workflow("_2fa_send")).toContain("class Activity2faSendWorkflow:");
      expect(workflow("__")).toContain("class ActivityWorkflow:");
      expect(workflow("__send__")).toContain("class SendWorkflow:");
    });

    it("keeps a .NET workflow class name when the method is only called Async", () => {
      const snippets = generateSnippets(
        factsFor(".NET", { activity: { name: "Async", line: 1 } }),
        address,
      );
      expect(snippets.map(({ label }) => label)).toContain("AsyncWorkflow.cs");
    });

    it("escapes quotes and braces in the address for each language's strings", () => {
      const odd: Address = {
        handle: "kris",
        name: 'a"b{c}\\',
        version: "1.0.0",
      };
      const python = generateSnippets(factsFor("Python"), odd);
      expect(snippet(python, "start.py")).toContain(
        String.raw`        id=f"a\"b{{c}}\\-{uuid.uuid4()}",`,
      );
      expect(snippet(python, "start.py")).toContain(
        String.raw`        task_queue="a\"b{c}\\",`,
      );
      const typescript = generateSnippets(factsFor("TypeScript"), {
        ...odd,
        name: "a`b${c}\\",
      });
      expect(snippet(typescript, "start.ts")).toContain(
        "        workflowId: `a\\`b\\${c}\\\\-${crypto.randomUUID()}`,",
      );
      const dotnet = generateSnippets(factsFor(".NET"), odd);
      expect(snippet(dotnet, "Starter.cs")).toContain(
        String.raw`new(id: $"a\"b{{c}}\\-{Guid.NewGuid()}", taskQueue: "a\"b{c}\\")`,
      );
      expect(snippet(dotnet, installLabel)).toContain(`cd 'a"b{c}\\'`);
    });

    it("asks for an environment variable the shell can't export", () => {
      expect(
        snippet(
          generateSnippets(
            factsFor("TypeScript", {
              configurationRead: [
                { name: "API_KEY", line: 1 },
                { name: "A$B", line: 2 },
              ],
            }),
            address,
          ),
          runLabel,
        ),
      ).toBe(
        "temporal server start-dev\nexport API_KEY=...\n# Also set the environment variable A$B.\nnpx tsx worker.ts\nnpx tsx start.ts",
      );
    });

    it("quotes a package name the shell would expand", () => {
      expect(
        snippet(
          generateSnippets(
            factsFor("TypeScript", {
              dependencies: [{ name: "~tilde", line: 1 }],
            }),
            address,
          ),
          installLabel,
        ),
      ).toMatch(/ '~tilde'$/);
    });
  });

  describe("from detection, for each SDK", () => {
    it("matches the activity page's workflow for the canvas's Python activity", () => {
      const code = [
        "from dataclasses import dataclass",
        "import os",
        "",
        "import stripe",
        "from temporalio import activity",
        "",
        'stripe.api_key = os.environ["STRIPE_API_KEY"]',
        "",
        "",
        "@dataclass",
        "class ChargeRequest:",
        "    request_id: str",
        "    amount_cents: int",
        "",
        "",
        "@dataclass",
        "class ChargeResult:",
        "    charge_id: str",
        "",
        "",
        "@activity.defn",
        "def charge_card(input: ChargeRequest) -> ChargeResult:",
        '    return ChargeResult(charge_id="ch_1", status="ok")',
      ].join("\n");
      const snippets = generateSnippets(
        checkCode(code, registeredSdks),
        address,
      );
      expect(snippet(snippets, "workflows.py")).toBe(
        [
          "from datetime import timedelta",
          "",
          "from temporalio import workflow",
          "",
          "with workflow.unsafe.imports_passed_through():",
          "    from activities import ChargeRequest, ChargeResult, charge_card",
          "",
          "",
          "@workflow.defn",
          "class ChargeCardWorkflow:",
          "    @workflow.run",
          "    async def run(self, input: ChargeRequest) -> ChargeResult:",
          "        return await workflow.execute_activity(",
          "            charge_card,",
          "            input,",
          "            # Temporal requires a start-to-close timeout. Set it for your activity.",
          "            start_to_close_timeout=timedelta(seconds=30),",
          "        )",
        ].join("\n"),
      );
      expect(snippet(snippets, installLabel)).toBe(
        "pip install temporalio\n# Also install the PyPI packages that provide: stripe",
      );
    });

    it("generates from a detected TypeScript activity", () => {
      const code = [
        'import { heartbeat } from "@temporalio/activity";',
        'import Stripe from "stripe";',
        "",
        "export interface ChargeRequest { amountCents: number }",
        "",
        "export async function chargeCard(input: ChargeRequest): Promise<string> {",
        "  heartbeat();",
        "  return process.env.STRIPE_API_KEY ?? String(input.amountCents);",
        "}",
      ].join("\n");
      const snippets = generateSnippets(
        checkCode(code, registeredSdks),
        address,
      );
      expect(snippet(snippets, "workflows.ts")).toContain(
        "export async function chargeCardWorkflow(input: ChargeRequest): Promise<string> {",
      );
      expect(snippet(snippets, "workflows.ts")).not.toMatch(/heartbeat/i);
      expect(snippet(snippets, runLabel)).toContain(
        "export STRIPE_API_KEY=...",
      );
    });

    it("generates from a detected .NET activity", () => {
      const code = [
        "using Stripe;",
        "using Temporalio.Activities;",
        "",
        "public class Payments",
        "{",
        "    [Activity]",
        "    public async Task<ChargeResult> ChargeCardAsync(ChargeRequest request)",
        "    {",
        "        return await Charge(request);",
        "    }",
        "}",
      ].join("\n");
      const snippets = generateSnippets(
        checkCode(code, registeredSdks),
        address,
      );
      expect(snippet(snippets, "ChargeCardWorkflow.cs")).toContain(
        "public async Task<ChargeResult> RunAsync(ChargeRequest input)",
      );
      expect(snippet(snippets, installLabel)).toContain(
        "# Also add the NuGet packages that provide: Stripe",
      );
    });
  });

  describe("the workflow sets only the start-to-close timeout", () => {
    const timeoutLines: Record<AcceptedSdk, string> = {
      Python:
        "            # Temporal requires a start-to-close timeout. Set it for your activity.\n            start_to_close_timeout=timedelta(seconds=30),\n        )",
      TypeScript:
        '({\n    // Temporal requires a start-to-close timeout. Set it for your activity.\n    startToCloseTimeout: "30 seconds",\n});',
      ".NET":
        "            {\n                // Temporal requires a start-to-close timeout. Set it for your activity.\n                StartToCloseTimeout = TimeSpan.FromSeconds(30),\n            });",
      PHP: "            // Temporal requires a start-to-close timeout. Set it for your activity.\n            ActivityOptions::new()->withStartToCloseTimeout(30),\n        );",
    };

    const workflowFile = (
      sdk: AcceptedSdk,
      changes: Partial<FactValues> = {},
    ) =>
      snippet(
        generateSnippets(factsFor(sdk, changes), address),
        fileLabels(sdk)[0] ?? "",
      );

    it.each(sdks)(
      "sets the %s timeout to 30 seconds, with the comment, as the only option",
      (sdk) => {
        for (const input of ["ChargeRequest", null]) {
          expect(workflowFile(sdk, { input })).toContain(timeoutLines[sdk]);
        }
      },
    );

    it.each(sdks)("sets no retry policy in any %s snippet", (sdk) => {
      for (const changes of [
        {},
        { input: null },
        { heartbeats: [{ line: 9 }] },
      ]) {
        for (const { code } of generateSnippets(
          factsFor(sdk, changes),
          address,
        )) {
          expect(code).not.toMatch(/retry|attempts/i);
        }
      }
    });

    it.each(sdks)(
      "sets no heartbeat timeout when the %s activity heartbeats",
      (sdk) => {
        for (const input of ["ChargeRequest", null]) {
          expect(
            workflowFile(sdk, {
              input,
              heartbeats: [{ line: 9 }, { line: 12 }],
            }),
          ).not.toMatch(/heartbeat/i);
        }
      },
    );

    it.each(sdks)(
      "gives a %s activity that heartbeats the same files as one that doesn't",
      (sdk) => {
        for (const input of ["ChargeRequest", null]) {
          expect(
            generateSnippets(
              factsFor(sdk, { input, heartbeats: [{ line: 9 }] }),
              address,
            ),
          ).toEqual(generateSnippets(factsFor(sdk, { input }), address));
        }
      },
    );

    it.each(sdks)(
      "uses 4-space indentation in every %s snippet, whatever the facts",
      (sdk) => {
        for (const changes of [
          { input: null },
          { output: null },
          { heartbeats: [{ line: 9 }] },
          { dependencies: [], configurationRead: [] },
          { runsAs: "async" as const },
        ]) {
          for (const { code } of generateSnippets(
            factsFor(sdk, changes),
            address,
          )) {
            for (const line of code.split("\n")) {
              const indent = /^\s*/.exec(line)?.[0] ?? "";
              expect(indent).not.toContain("\t");
              expect(indent.length % 4).toBe(0);
            }
          }
        }
      },
    );
  });

  describe("an activity with no detected packages", () => {
    it.each([
      ["Python", "pip install temporalio"],
      [
        "TypeScript",
        "npm install @temporalio/activity @temporalio/client @temporalio/worker @temporalio/workflow",
      ],
      [
        ".NET",
        "dotnet new console --output charge-card\ncd charge-card\ndotnet add package Temporalio",
      ],
      [
        "PHP",
        "composer require temporal/sdk\n./vendor/bin/rr get\n# RoadRunner needs PHP's grpc extension. Install it with: pecl install grpc",
      ],
    ] as const)("still installs the %s SDK", (sdk, command) => {
      expect(
        snippet(
          generateSnippets(factsFor(sdk, { dependencies: [] }), address),
          installLabel,
        ),
      ).toBe(command);
    });
  });

  describe("the install command, four files and run commands for each SDK", () => {
    it.each(sdks)(
      "generates the expected install command, files and run commands for %s",
      (sdk) => {
        expect(generateSnippets(factsFor(sdk), address)).toEqual(
          expectedSnippets[sdk],
        );
      },
    );

    it.each([
      ["Python", "activities.py"],
      ["TypeScript", "activities.ts"],
      [".NET", "Activities.cs"],
      ["PHP", "Activities.php"],
    ] as const)(
      "names the %s activity file %s, the file the workflow and worker import",
      (sdk, fileName) => {
        expect(sdkRegistry[sdk].display.activityFileName).toBe(fileName);
        const importsActivityFile = {
          Python: "from activities import",
          TypeScript: 'from "./activities"',
          ".NET": "activities.ChargeCardAsync",
          PHP: "Activities::class",
        }[sdk];
        for (const { code } of files(expectedSnippets[sdk]).slice(0, 2)) {
          expect(code).toContain(importsActivityFile);
        }
      },
    );
  });
});

describe("the PHP snippets", () => {
  const php = (changes: Partial<FactValues> = {}) =>
    generateSnippets(factsFor("PHP", changes), address);

  it("sends five files with the published activity: the workflow, worker, starter and .rr.yaml", () => {
    expect(files(php()).map(({ label }) => label)).toEqual([
      "ChargeCardWorkflow.php",
      "worker.php",
      "starter.php",
    ]);
    expect(snippet(php(), ".rr.yaml")).not.toBe("");
    expect(sdkRegistry.PHP.display.activityFileName).toBe("Activities.php");
  });

  it("sends the RoadRunner config after the run commands, so the first five keep every SDK's order", () => {
    const labels = php().map(({ label }) => label);
    expect(labels.slice(0, 5)).toEqual([
      installLabel,
      "ChargeCardWorkflow.php",
      "worker.php",
      "starter.php",
      runLabel,
    ]);
    expect(labels[5]).toBe(".rr.yaml");
  });

  it("installs the SDK with composer, then RoadRunner, noting the grpc extension", () => {
    const install = snippet(php({ dependencies: [] }), installLabel).split(
      "\n",
    );
    expect(install).toEqual([
      "composer require temporal/sdk",
      "./vendor/bin/rr get",
      "# RoadRunner needs PHP's grpc extension. Install it with: pecl install grpc",
    ]);
  });

  it("names each detected package namespace after the install steps", () => {
    const install = snippet(
      php({
        dependencies: [
          { name: "Stripe", line: 2 },
          { name: "Aws\\S3", line: 3 },
        ],
      }),
      installLabel,
    );
    expect(install.split("\n").at(-1)).toBe(
      "# Also composer require the packages that provide: Stripe, Aws\\S3",
    );
  });

  it("renders .rr.yaml with a server command that runs php worker.php", () => {
    const config = snippet(php(), ".rr.yaml");
    expect(config).toContain('server:\n    command: "php worker.php"');
    expect(config).toContain('temporal:\n    address: "127.0.0.1:7233"');
    expect(config.startsWith('version: "3"')).toBe(true);
  });

  it("starts the worker with ./rr serve, after the dev server and before the workflow", () => {
    expect(
      snippet(php({ configurationRead: [] }), runLabel).split("\n"),
    ).toEqual(["temporal server start-dev", "./rr serve", "php starter.php"]);
  });

  it("registers the workflow and the activity on the address's task queue", () => {
    const worker = snippet(php(), "worker.php");
    expect(worker).toContain("$worker = $factory->newWorker('charge-card');");
    expect(worker).toContain("require 'Activities.php';");
    expect(worker).toContain("require 'ChargeCardWorkflow.php';");
    expect(worker).toContain(
      "$worker->registerWorkflowTypes(ChargeCardWorkflow::class);",
    );
    expect(worker).toContain("$worker->registerActivity(Activities::class);");
  });

  it("types the workflow's input when it is known, and asks for it when it isn't", () => {
    expect(snippet(php(), "ChargeCardWorkflow.php")).toContain(
      "    public function run(ChargeRequest $input)\n",
    );
    const unknown = php({ input: null });
    expect(snippet(unknown, "ChargeCardWorkflow.php")).toContain(
      "    public function run(mixed $input)\n",
    );
    expect(snippet(unknown, "ChargeCardWorkflow.php")).toContain(
      "Detection couldn't read what chargeCard takes.",
    );
    expect(snippet(unknown, "starter.php")).toContain(
      "// Fill in the arguments chargeCard takes.",
    );
  });

  it("leaves out the result when the activity has no output", () => {
    const snippets = php({ output: null });
    expect(snippet(snippets, "ChargeCardWorkflow.php")).toContain(
      "        yield $activities->chargeCard($input);",
    );
    expect(snippet(snippets, "ChargeCardWorkflow.php")).not.toContain("return");
    expect(snippet(snippets, "starter.php")).not.toContain("result");
  });

  it("escapes quotes and backslashes in the address for PHP's strings", () => {
    const snippets = generateSnippets(factsFor("PHP"), {
      ...address,
      name: "it's\\odd",
    });
    expect(snippet(snippets, "worker.php")).toContain(
      "newWorker('it\\'s\\\\odd')",
    );
    expect(snippet(snippets, "starter.php")).toContain(
      "->withWorkflowId('it\\'s\\\\odd-' . uniqid())",
    );
  });

  it("starts the workflow class with a letter when the method name doesn't give one", () => {
    const snippets = php({ activity: { name: "_9lives", line: 1 } });
    expect(snippets.map(({ label }) => label)).toContain(
      "Activity9livesWorkflow.php",
    );
  });

  it("generates from a detected PHP activity", () => {
    const code = [
      "<?php",
      "use Stripe\\StripeClient;",
      "use Temporal\\Activity\\ActivityInterface;",
      "",
      "#[ActivityInterface]",
      "class Payments",
      "{",
      "    public function chargeCard(ChargeRequest $request): ChargeResult",
      "    {",
      "        return new ChargeResult();",
      "    }",
      "}",
    ].join("\n");
    const snippets = generateSnippets(checkCode(code, registeredSdks), address);
    expect(snippet(snippets, "ChargeCardWorkflow.php")).toContain(
      "        return yield $activities->chargeCard($input);",
    );
    expect(snippet(snippets, installLabel)).toContain(
      "# Also composer require the packages that provide: Stripe",
    );
  });

  it("names no thread pool in any PHP snippet", () => {
    for (const { code } of php()) {
      expect(code).not.toMatch(/thread[ _]?pool/i);
    }
  });
});
