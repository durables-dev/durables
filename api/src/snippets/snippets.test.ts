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
      Rust: "charge_card",
    }[sdk],
    line: 1,
  },
  input: "ChargeRequest",
  output: "ChargeResult",
  runsAs: sdk === "Python" ? "sync" : "async",
  nonRetryableErrors: [],
  configurationRead: [{ name: "STRIPE_API_KEY", line: 4 }],
  dependencies: [{ name: sdk === ".NET" ? "Stripe" : "stripe", line: 2 }],
  heartbeats: [],
  ...changes,
});

/** The file names of the workflow, worker and starter, for an activity in the given SDK. */
const fileLabels = (sdk: AcceptedSdk, workflowClass = "ChargeCardWorkflow") =>
  ({
    Python: ["workflows.py", "worker.py", "start.py"],
    TypeScript: ["workflows.ts", "worker.ts", "start.ts"],
    ".NET": [`${workflowClass}.cs`, "Program.cs", "Starter.cs"],
    Rust: ["workflows.rs", "main.rs", "starter.rs"],
  })[sdk];

/** The snippet with the label. Fails the test when there is none. */
const snippet = (snippets: readonly Snippet[], label: string) => {
  const found = snippets.find((entry) => entry.label === label);
  if (found === undefined) {
    throw new Error(`No snippet labelled ${label}`);
  }
  return found.code;
};

/** The workflow, worker and starter files, in that order. */
const files = (snippets: readonly Snippet[]) => snippets.slice(1, -1);

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
  Rust: "//",
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
  Rust: [
    {
      label: "Install",
      code: [
        "[dependencies]",
        'futures = "0.3"',
        'serde = { version = "1", features = ["derive"] }',
        'temporalio-client = "1.0.0"',
        'temporalio-common = "1.0.0"',
        'temporalio-macros = "1.0.0"',
        'temporalio-sdk = "1.0.0"',
        'temporalio-workflow = "1.0.0"',
        'tokio = { version = "1", features = ["full"] }',
        "# Also add the crates that provide: stripe",
      ].join("\n"),
    },
    {
      label: "workflows.rs",
      code: [
        "use std::time::Duration;",
        "",
        "use temporalio_macros::{workflow, workflow_methods};",
        "use temporalio_sdk::{ActivityOptions, WorkflowContext, WorkflowContextView, WorkflowResult};",
        "",
        "use crate::activities::{Activities, ChargeRequest, ChargeResult};",
        "",
        "// Activities stands in for the type whose #[activities] impl declares charge_card. Change it",
        "// to your type's name here and in main.rs.",
        "#[workflow]",
        "pub struct ChargeCardWorkflow {",
        "    input: ChargeRequest,",
        "}",
        "",
        "#[workflow_methods]",
        "impl ChargeCardWorkflow {",
        "    #[init]",
        "    fn new(_ctx: &WorkflowContextView, input: ChargeRequest) -> Self {",
        "        Self { input }",
        "    }",
        "",
        "    #[run]",
        "    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<ChargeResult> {",
        "        // Reading the input from the workflow's state needs ChargeRequest to implement Clone.",
        "        let input = ctx.state(|s| s.input.clone());",
        "        let result = ctx",
        "            .execute_activity(",
        "                Activities::charge_card,",
        "                input,",
        "                // Temporal requires a start-to-close timeout. Set it for your activity.",
        "                ActivityOptions::start_to_close_timeout(Duration::from_secs(30)),",
        "            )",
        "            .await?;",
        "        Ok(result)",
        "    }",
        "}",
      ].join("\n"),
    },
    {
      label: "main.rs",
      code: [
        "use temporalio_client::{",
        "    Client, ClientOptions, Connection,",
        "    envconfig::LoadClientConfigProfileOptions,",
        "};",
        "use temporalio_sdk::{Runtime, Worker, WorkerOptions};",
        "",
        "mod activities;",
        "mod starter;",
        "mod workflows;",
        "",
        "use crate::activities::Activities;",
        "use crate::workflows::ChargeCardWorkflow;",
        "",
        "#[tokio::main]",
        "async fn main() -> Result<(), Box<dyn std::error::Error>> {",
        '    if std::env::args().nth(1).as_deref() == Some("start") {',
        "        return starter::run().await;",
        "    }",
        "",
        "    let runtime = Runtime::from_current_tokio(Default::default())?;",
        "",
        "    let (connection_options, client_options) = ClientOptions::load_from_config(",
        "        LoadClientConfigProfileOptions::default(),",
        "    )?;",
        "",
        "    let connection = Connection::connect(connection_options).await?;",
        "    let client = Client::new(connection, client_options)?;",
        "",
        "    // Activities stands in for the type whose #[activities] impl declares charge_card.",
        "    // Change it to your type's name, and pass it what your activities need.",
        '    let worker_options = WorkerOptions::new("charge-card")',
        "        .register_activities(Activities)",
        "        .register_workflow::<ChargeCardWorkflow>()?",
        "        .build();",
        "",
        "    let mut worker = Worker::new(&runtime, client, worker_options)?;",
        "    worker.run().await?;",
        "",
        "    Ok(())",
        "}",
      ].join("\n"),
    },
    {
      label: "starter.rs",
      code: [
        "use std::time::{SystemTime, UNIX_EPOCH};",
        "",
        "use temporalio_client::{",
        "    Client, ClientOptions, Connection, GetWorkflowResultOptions, WorkflowOptions,",
        "    envconfig::LoadClientConfigProfileOptions,",
        "};",
        "",
        "use crate::activities::ChargeRequest;",
        "use crate::workflows::ChargeCardWorkflow;",
        "",
        "pub async fn run() -> Result<(), Box<dyn std::error::Error>> {",
        "    let (connection_options, client_options) = ClientOptions::load_from_config(",
        "        LoadClientConfigProfileOptions::default(),",
        "    )?;",
        "",
        "    let connection = Connection::connect(connection_options).await?;",
        "    let client = Client::new(connection, client_options)?;",
        "",
        "    // Fill in the input to pass to charge_card.",
        "    let input: ChargeRequest = todo!();",
        "    let started = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();",
        "    let handle = client",
        "        .start_workflow(",
        "            ChargeCardWorkflow::run,",
        "            input,",
        '            WorkflowOptions::new("charge-card", format!("charge-card-{}", started)).build(),',
        "        )",
        "        .await?;",
        "    let result = handle.get_result(GetWorkflowResultOptions::default()).await?;",
        '    println!("{result:?}");',
        "    Ok(())",
        "}",
      ].join("\n"),
    },
    {
      label: "Run",
      code: [
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "cargo run",
        "cargo run -- start",
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
        ).toEqual([installLabel, ...fileLabels(sdk), runLabel]);
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
      Rust: "                input,\n                // Temporal requires a start-to-close timeout. Set it for your activity.\n                ActivityOptions::start_to_close_timeout(Duration::from_secs(30)),\n            )",
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
        "Rust",
        '[dependencies]\nfutures = "0.3"\nserde = { version = "1", features = ["derive"] }\ntemporalio-client = "1.0.0"\ntemporalio-common = "1.0.0"\ntemporalio-macros = "1.0.0"\ntemporalio-sdk = "1.0.0"\ntemporalio-workflow = "1.0.0"\ntokio = { version = "1", features = ["full"] }',
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
      ["Rust", "activities.rs"],
    ] as const)(
      "names the %s activity file %s, the file the workflow and worker import",
      (sdk, fileName) => {
        expect(sdkRegistry[sdk].display.activityFileName).toBe(fileName);
        const importsActivityFile = {
          Python: "from activities import",
          TypeScript: 'from "./activities"',
          ".NET": "activities.ChargeCardAsync",
          Rust: "use crate::activities::",
        }[sdk];
        for (const { code } of files(expectedSnippets[sdk]).slice(0, 2)) {
          expect(code).toContain(importsActivityFile);
        }
      },
    );
  });

  describe("Rust", () => {
    const rustSnippets = (changes: Partial<FactValues> = {}) =>
      generateSnippets(factsFor("Rust", changes), address);

    it("installs with the quickstart's Cargo.toml fragment and notes each detected crate", () => {
      const install = snippet(
        rustSnippets({
          dependencies: [
            { name: "aws_sdk_s3", line: 1 },
            { name: "serde", line: 2 },
            { name: "slack_morphism", line: 3 },
            { name: "tokio", line: 4 },
          ],
        }),
        installLabel,
      );
      expect(install.split("\n")[0]).toBe("[dependencies]");
      expect(install).toContain('temporalio-sdk = "1.0.0"');
      expect(install).not.toMatch(/cargo add/);
      // serde and tokio are already in the fragment, so the note leaves them out.
      expect(install.split("\n").at(-1)).toBe(
        "# Also add the crates that provide: aws_sdk_s3, slack_morphism",
      );
    });

    it("names every file in Rust and runs the worker with cargo run", () => {
      const snippets = rustSnippets();
      expect(files(snippets).map(({ label }) => label)).toEqual([
        "workflows.rs",
        "main.rs",
        "starter.rs",
      ]);
      expect(snippet(snippets, runLabel).split("\n")).toEqual([
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "cargo run",
        "cargo run -- start",
      ]);
      expect(snippet(snippets, "main.rs")).toContain("mod activities;");
    });

    it("never sets up a thread pool, for a sync or an async activity", () => {
      for (const runsAs of ["sync", "async"] as const) {
        for (const { code } of rustSnippets({ runsAs })) {
          expect(code).not.toMatch(/thread/i);
        }
      }
    });

    it("gives an unread input a type alias the developer changes", () => {
      const snippets = rustSnippets({ input: null });
      const workflow = snippet(snippets, "workflows.rs");
      expect(workflow).toContain(
        "// Detection couldn't read what charge_card takes. Change Input to its input type, and\n",
      );
      expect(workflow).toContain("pub type Input = ();");
      expect(workflow).toContain(
        "use crate::activities::{Activities, ChargeResult};",
      );
      const starter = snippet(snippets, "starter.rs");
      expect(starter).toContain(
        "use crate::workflows::{ChargeCardWorkflow, Input};",
      );
      expect(starter).toContain("    let input: Input = todo!();");
      expect(starter).not.toContain("crate::activities");
    });

    it("returns () and prints nothing when the activity has no output", () => {
      const snippets = rustSnippets({ output: null });
      const workflow = snippet(snippets, "workflows.rs");
      expect(workflow).toContain("-> WorkflowResult<()> {");
      expect(workflow).toContain("        ctx\n            .execute_activity(");
      expect(workflow).toContain("        Ok(())\n");
      expect(workflow).toContain(
        "use crate::activities::{Activities, ChargeRequest};",
      );
      const starter = snippet(snippets, "starter.rs");
      expect(starter).toContain(
        "    handle.get_result(GetWorkflowResultOptions::default()).await?;\n    Ok(())",
      );
      expect(starter).not.toContain("println!");
    });

    it("imports only the names a type needs from the activity's file", () => {
      const snippets = rustSnippets({
        input: "Vec<models::Item>",
        output: "Option<HashMap<String, Receipt>>",
      });
      expect(snippet(snippets, "workflows.rs")).toContain(
        "use crate::activities::{Activities, HashMap, Receipt};",
      );
      expect(snippet(snippets, "starter.rs")).not.toContain(
        "use crate::activities",
      );
    });

    it("names the workflow from a raw or underscore-led activity name", () => {
      expect(
        snippet(
          rustSnippets({ activity: { name: "r#match", line: 1 } }),
          "workflows.rs",
        ),
      ).toContain("pub struct MatchWorkflow {");
      expect(
        snippet(
          rustSnippets({ activity: { name: "_9lives", line: 1 } }),
          "workflows.rs",
        ),
      ).toContain("pub struct Activity9livesWorkflow {");
    });

    it("escapes quotes, backslashes and braces in the address for Rust's strings", () => {
      const snippets = generateSnippets(factsFor("Rust"), {
        ...address,
        name: 'a"b\\c{d}',
      });
      expect(snippet(snippets, "main.rs")).toContain(
        'WorkerOptions::new("a\\"b\\\\c{d}")',
      );
      expect(snippet(snippets, "starter.rs")).toContain(
        'format!("a\\"b\\\\c{{d}}-{}", started)',
      );
    });

    it("generates from a detected Rust activity", () => {
      const code = [
        "use std::env;",
        "use stripe::Client;",
        "use temporalio_macros::activities;",
        "use temporalio_sdk::activities::{ActivityContext, ActivityError};",
        "",
        "pub struct Payments;",
        "",
        "#[activities]",
        "impl Payments {",
        "    #[activity]",
        "    pub async fn charge_card(ctx: ActivityContext, input: ChargeRequest) -> Result<ChargeResult, ActivityError> {",
        '        let key = env::var("STRIPE_API_KEY")?;',
        "        todo!()",
        "    }",
        "}",
      ].join("\n");
      expect(
        generateSnippets(checkCode(code, registeredSdks), address),
      ).toEqual(expectedSnippets.Rust);
    });
  });
});
