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
      Go: "ChargeCard",
      Java: "chargeCard",
      Python: "charge_card",
      TypeScript: "chargeCard",
      ".NET": "ChargeCardAsync",
      Ruby: "ChargeCard",
      PHP: "chargeCard",
      Rust: "charge_card",
    }[sdk],
    line: 1,
  },
  input: "ChargeRequest",
  output: "ChargeResult",
  runsAs: ["Python", "Go", "Java", "Ruby", "PHP"].includes(sdk)
    ? "sync"
    : "async",
  nonRetryableErrors: [],
  configurationRead: [{ name: "STRIPE_API_KEY", line: 4 }],
  dependencies: [
    {
      name: {
        Go: "github.com/stripe/stripe-go/v87",
        Java: "com.stripe",
        Python: "stripe",
        TypeScript: "stripe",
        ".NET": "Stripe",
        Ruby: "stripe",
        PHP: "Stripe",
        Rust: "stripe",
      }[sdk],
      line: 2,
    },
  ],
  heartbeats: [],
  ...changes,
});

/** The file names of the workflow, worker and starter, for an activity in the given SDK. */
const fileLabels = (sdk: AcceptedSdk, workflowClass = "ChargeCardWorkflow") =>
  ({
    Go: ["workflow.go", "worker/main.go", "start/main.go"],
    Java: [`${workflowClass}.java`, "ChargeCardWorker.java", "Starter.java"],
    Python: ["workflows.py", "worker.py", "start.py"],
    TypeScript: ["workflows.ts", "worker.ts", "start.ts"],
    ".NET": [`${workflowClass}.cs`, "Program.cs", "Starter.cs"],
    Rust: ["workflows.rs", "main.rs", "starter.rs"],
    Ruby: ["workflow.rb", "worker.rb", "starter.rb"],
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
  Go: "//",
  Java: "//",
  Python: "#",
  TypeScript: "//",
  ".NET": "//",
  Rust: "//",
  Ruby: "#",
  PHP: "//",
};

/** The generated text for each SDK's fixture activity, `factsFor(sdk)` at `address`. */
const expectedSnippets: Record<AcceptedSdk, Snippet[]> = {
  Go: [
    {
      label: "Install",
      code: [
        "go mod init charge-card",
        "go get go.temporal.io/sdk",
        "go get github.com/stripe/stripe-go/v87",
      ].join("\n"),
    },
    {
      label: "workflow.go",
      code: [
        "package app // Use the package name activity.go declares.",
        "",
        "import (",
        '    "time"',
        "",
        '    "go.temporal.io/sdk/workflow"',
        ")",
        "",
        "func ChargeCardWorkflow(ctx workflow.Context, input ChargeRequest) (ChargeResult, error) {",
        "    ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{",
        "        // Temporal requires a start-to-close timeout. Set it for your activity.",
        "        StartToCloseTimeout: 30 * time.Second,",
        "    })",
        "",
        "    var result ChargeResult",
        "    err := workflow.ExecuteActivity(ctx, ChargeCard, input).Get(ctx, &result)",
        "    return result, err",
        "}",
      ].join("\n"),
    },
    {
      label: "worker/main.go",
      code: [
        "package main",
        "",
        "import (",
        '    "log"',
        "",
        '    app "charge-card"',
        "",
        '    "go.temporal.io/sdk/client"',
        '    "go.temporal.io/sdk/worker"',
        ")",
        "",
        "func main() {",
        "    c, err := client.Dial(client.Options{})",
        "    if err != nil {",
        '        log.Fatalln("Unable to create client", err)',
        "    }",
        "    defer c.Close()",
        "",
        '    w := worker.New(c, "charge-card", worker.Options{})',
        "    w.RegisterWorkflow(app.ChargeCardWorkflow)",
        "    // If ChargeCard is a method, register a value of its type instead, such as",
        "    // w.RegisterActivity(&app.Activities{}).",
        "    w.RegisterActivity(app.ChargeCard)",
        "",
        "    err = w.Run(worker.InterruptCh())",
        "    if err != nil {",
        '        log.Fatalln("Unable to start worker", err)',
        "    }",
        "}",
      ].join("\n"),
    },
    {
      label: "start/main.go",
      code: [
        "package main",
        "",
        "import (",
        '    "context"',
        '    "fmt"',
        '    "log"',
        '    "time"',
        "",
        '    app "charge-card"',
        "",
        '    "go.temporal.io/sdk/client"',
        ")",
        "",
        "func main() {",
        "    c, err := client.Dial(client.Options{})",
        "    if err != nil {",
        '        log.Fatalln("Unable to create client", err)',
        "    }",
        "    defer c.Close()",
        "",
        "    options := client.StartWorkflowOptions{",
        '        ID:        fmt.Sprintf("charge-card-%d", time.Now().UnixNano()),',
        '        TaskQueue: "charge-card",',
        "    }",
        "    // Fill in the input to pass to ChargeCard.",
        "    var input app.ChargeRequest",
        "    we, err := c.ExecuteWorkflow(context.Background(), options, app.ChargeCardWorkflow, input)",
        "    if err != nil {",
        '        log.Fatalln("Unable to execute workflow", err)',
        "    }",
        "",
        "    var result app.ChargeResult",
        "    err = we.Get(context.Background(), &result)",
        "    if err != nil {",
        '        log.Fatalln("Unable to get workflow result", err)',
        "    }",
        '    log.Println("Workflow result:", result)',
        "}",
      ].join("\n"),
    },
    {
      label: "Run",
      code: [
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "go run worker/main.go",
        "go run start/main.go",
      ].join("\n"),
    },
  ],
  Java: [
    {
      label: "Install",
      code: [
        "<!-- Add this to the <dependencies> section of your pom.xml. -->",
        "<dependency>",
        "    <groupId>io.temporal</groupId>",
        "    <artifactId>temporal-sdk</artifactId>",
        "    <version>1.40.0</version>",
        "</dependency>",
        "<!-- Also add the Maven dependencies that provide: com.stripe -->",
      ].join("\n"),
    },
    {
      label: "ChargeCardWorkflow.java",
      code: [
        "import io.temporal.activity.ActivityOptions;",
        "import io.temporal.workflow.Workflow;",
        "import io.temporal.workflow.WorkflowInterface;",
        "import io.temporal.workflow.WorkflowMethod;",
        "import java.time.Duration;",
        "",
        "@WorkflowInterface",
        "public interface ChargeCardWorkflow {",
        "",
        "    @WorkflowMethod",
        "    ChargeResult run(ChargeRequest input);",
        "}",
        "",
        "// Activities stands in for the interface that declares chargeCard. Change it to your",
        "// interface's name, and import it and the types it uses if they are in a package.",
        "class ChargeCardWorkflowImpl implements ChargeCardWorkflow {",
        "",
        "    private final Activities activities = Workflow.newActivityStub(",
        "            Activities.class,",
        "            ActivityOptions.newBuilder()",
        "                    // Temporal requires a start-to-close timeout. Set it for your activity.",
        "                    .setStartToCloseTimeout(Duration.ofSeconds(30))",
        "                    .build());",
        "",
        "    @Override",
        "    public ChargeResult run(ChargeRequest input) {",
        "        return activities.chargeCard(input);",
        "    }",
        "}",
      ].join("\n"),
    },
    {
      label: "ChargeCardWorker.java",
      code: [
        "import io.temporal.client.WorkflowClient;",
        "import io.temporal.serviceclient.WorkflowServiceStubs;",
        "import io.temporal.worker.Worker;",
        "import io.temporal.worker.WorkerFactory;",
        "",
        "public class ChargeCardWorker {",
        "",
        "    public static void main(String[] args) {",
        "        WorkflowServiceStubs service = WorkflowServiceStubs.newLocalServiceStubs();",
        "        WorkflowClient client = WorkflowClient.newInstance(service);",
        "        WorkerFactory factory = WorkerFactory.newInstance(client);",
        '        Worker worker = factory.newWorker("charge-card");',
        "        worker.registerWorkflowImplementationTypes(ChargeCardWorkflowImpl.class);",
        "        // ActivitiesImpl stands in for the class that implements chargeCard. Change it",
        "        // to your class's name, and import it if it is in a package.",
        "        worker.registerActivitiesImplementations(new ActivitiesImpl());",
        "        factory.start();",
        "    }",
        "}",
      ].join("\n"),
    },
    {
      label: "Starter.java",
      code: [
        "import io.temporal.client.WorkflowClient;",
        "import io.temporal.client.WorkflowOptions;",
        "import io.temporal.serviceclient.WorkflowServiceStubs;",
        "import java.util.UUID;",
        "",
        "public class Starter {",
        "",
        "    public static void main(String[] args) {",
        "        WorkflowServiceStubs service = WorkflowServiceStubs.newLocalServiceStubs();",
        "        WorkflowClient client = WorkflowClient.newInstance(service);",
        "        ChargeCardWorkflow workflow = client.newWorkflowStub(",
        "                ChargeCardWorkflow.class,",
        "                WorkflowOptions.newBuilder()",
        '                        .setWorkflowId("charge-card-" + UUID.randomUUID())',
        '                        .setTaskQueue("charge-card")',
        "                        .build());",
        "        // Fill in the input to pass to chargeCard.",
        "        ChargeRequest input = null;",
        "        ChargeResult result = workflow.run(input);",
        "        System.out.println(result);",
        "        System.exit(0);",
        "    }",
        "}",
      ].join("\n"),
    },
    {
      label: "Run",
      code: [
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "mvn compile exec:java -Dexec.mainClass=ChargeCardWorker",
        "mvn compile exec:java -Dexec.mainClass=Starter",
      ].join("\n"),
    },
  ],
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
        "# The Temporal Rust SDK needs protoc to build: install the Protocol Buffers compiler first.",
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
        "    Client, ClientOptions, Connection, WorkflowGetResultOptions, WorkflowStartOptions,",
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
        '            WorkflowStartOptions::new("charge-card", format!("charge-card-{}", started)).build(),',
        "        )",
        "        .await?;",
        "    let result = handle.get_result(WorkflowGetResultOptions::default()).await?;",
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
  Ruby: [
    {
      label: "Install",
      code: [
        "bundle add temporalio",
        "# Also add the gems that provide: stripe",
      ].join("\n"),
    },
    {
      label: "workflow.rb",
      code: [
        'require "temporalio/workflow"',
        "",
        'require_relative "activities"',
        "",
        "class ChargeCardWorkflow < Temporalio::Workflow::Definition",
        "    # input is the ChargeRequest to pass to ChargeCard.",
        "    def execute(input)",
        "        Temporalio::Workflow.execute_activity(",
        "            ChargeCard,",
        "            input,",
        "            # Temporal requires a start-to-close timeout. Set it for your activity.",
        "            start_to_close_timeout: 30",
        "        )",
        "    end",
        "end",
      ].join("\n"),
    },
    {
      label: "worker.rb",
      code: [
        'require "temporalio/client"',
        'require "temporalio/worker"',
        "",
        'require_relative "activities"',
        'require_relative "workflow"',
        "",
        'client = Temporalio::Client.connect("localhost:7233", "default")',
        "worker = Temporalio::Worker.new(",
        "    client: client,",
        '    task_queue: "charge-card",',
        "    workflows: [ChargeCardWorkflow],",
        "    activities: [ChargeCard]",
        ")",
        'worker.run(shutdown_signals: ["SIGINT"])',
      ].join("\n"),
    },
    {
      label: "starter.rb",
      code: [
        'require "securerandom"',
        'require "temporalio/client"',
        "",
        'require_relative "workflow"',
        "",
        'client = Temporalio::Client.connect("localhost:7233", "default")',
        "# Fill in the ChargeRequest to pass to ChargeCard.",
        "input = nil",
        "result = client.execute_workflow(",
        "    ChargeCardWorkflow,",
        "    input,",
        '    id: "charge-card-#{SecureRandom.uuid}",',
        '    task_queue: "charge-card"',
        ")",
        "puts result",
      ].join("\n"),
    },
    {
      label: "Run",
      code: [
        "temporal server start-dev",
        "export STRIPE_API_KEY=...",
        "bundle exec ruby worker.rb",
        "bundle exec ruby starter.rb",
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

    it("passes a Go activity its input type, qualified with the activity's package outside it", () => {
      const snippets = generateSnippets(factsFor("Go"), address);
      expect(snippet(snippets, "workflow.go")).toContain(
        "func ChargeCardWorkflow(ctx workflow.Context, input ChargeRequest) (ChargeResult, error) {\n",
      );
      expect(snippet(snippets, "workflow.go")).toContain(
        "    err := workflow.ExecuteActivity(ctx, ChargeCard, input).Get(ctx, &result)\n",
      );
      expect(snippet(snippets, "start/main.go")).toContain(
        "    var input app.ChargeRequest\n",
      );
      expect(snippet(snippets, "start/main.go")).toContain(
        "    var result app.ChargeResult\n",
      );
      expect(snippet(snippets, "worker/main.go")).toContain(
        "    w.RegisterActivity(app.ChargeCard)\n",
      );
    });

    it("qualifies only the Go types from the activity's package, and asks for other packages' imports", () => {
      const snippets = generateSnippets(
        factsFor("Go", {
          input: "map[string][]LineItem",
          output: "*models.Receipt",
        }),
        address,
      );
      const starter = snippet(snippets, "start/main.go");
      expect(starter).toContain("    var input map[string][]app.LineItem\n");
      expect(starter).toContain("    var result *models.Receipt\n");
      expect(starter).toContain(
        "\n// Also import the packages that provide: models\nfunc main() {",
      );
      const workflow = snippet(snippets, "workflow.go");
      expect(workflow).toContain(
        "input map[string][]LineItem) (*models.Receipt, error) {",
      );
      expect(workflow).toContain(
        "// Also import the packages that provide: models\nfunc ChargeCardWorkflow(",
      );
      expect(
        snippet(generateSnippets(factsFor("Go"), address), "workflow.go"),
      ).not.toContain("Also import");
    });

    it("leaves Go's own types unqualified in the starter", () => {
      const starter = snippet(
        generateSnippets(
          factsFor("Go", { input: "string", output: "[]byte" }),
          address,
        ),
        "start/main.go",
      );
      expect(starter).toContain("    var input string\n");
      expect(starter).toContain("    var result []byte\n");
    });

    it("returns only the Go activity's error when it has no output", () => {
      const snippets = generateSnippets(
        factsFor("Go", { output: null }),
        address,
      );
      const workflow = snippet(snippets, "workflow.go");
      expect(workflow).toContain("input ChargeRequest) error {\n");
      expect(workflow).toContain(
        "    return workflow.ExecuteActivity(ctx, ChargeCard, input).Get(ctx, nil)\n}",
      );
      const starter = snippet(snippets, "start/main.go");
      expect(starter).toContain(
        "    err = we.Get(context.Background(), nil)\n",
      );
      expect(starter).toContain('    log.Println("Workflow completed")\n');
      expect(starter).not.toContain("&result");
      expect(starter).not.toContain("var result");
    });

    it("installs the Go SDK, then every detected module in one go get", () => {
      expect(
        snippet(
          generateSnippets(
            factsFor("Go", {
              dependencies: [
                { name: "github.com/stripe/stripe-go/v87", line: 2 },
                { name: "github.com/jackc/pgx/v5/pgxpool", line: 3 },
              ],
            }),
            address,
          ),
          installLabel,
        ),
      ).toBe(
        "go mod init charge-card\ngo get go.temporal.io/sdk\ngo get github.com/stripe/stripe-go/v87 github.com/jackc/pgx/v5/pgxpool",
      );
    });

    it("imports the Go activity's package by the module's path, under one name", () => {
      for (const label of ["worker/main.go", "start/main.go"]) {
        expect(
          snippet(generateSnippets(factsFor("Go"), address), label),
        ).toContain('\n    app "charge-card"\n');
      }
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

    it("passes the Go arguments as a list the developer fills in", () => {
      const snippets = generateSnippets(
        factsFor("Go", { input: null }),
        address,
      );
      const workflow = snippet(snippets, "workflow.go");
      expect(workflow).toContain(
        "func ChargeCardWorkflow(ctx workflow.Context, args []any) (ChargeResult, error) {\n",
      );
      expect(workflow).toContain(
        "    // Detection couldn't read what ChargeCard takes. Fill in its arguments when\n",
      );
      expect(workflow).toContain(
        "workflow.ExecuteActivity(ctx, ChargeCard, args...).Get(ctx, &result)",
      );
      const starter = snippet(snippets, "start/main.go");
      expect(starter).toContain(
        "    // Fill in the arguments ChargeCard takes, in order.\n    args := []any{}\n",
      );
      expect(starter).toContain("options, app.ChargeCardWorkflow, args)\n");
      expect(starter).not.toContain("var input");
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
      const go = generateSnippets(factsFor("Go"), { ...odd, name: 'a"b%d\\' });
      expect(snippet(go, "start/main.go")).toContain(
        String.raw`        ID:        fmt.Sprintf("a\"b%%d\\-%d", time.Now().UnixNano()),`,
      );
      expect(snippet(go, "start/main.go")).toContain(
        String.raw`        TaskQueue: "a\"b%d\\",`,
      );
      expect(snippet(go, "worker/main.go")).toContain(
        String.raw`    app "a\"b%d\\"`,
      );
      expect(snippet(go, installLabel)).toContain(`go mod init 'a"b%d\\'`);
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
      expect(snippet(snippets, "workflows.ts")).toContain(
        'heartbeatTimeout: "10 seconds",',
      );
      expect(snippet(snippets, runLabel)).toContain(
        "export STRIPE_API_KEY=...",
      );
    });

    it("generates from a detected Go activity", () => {
      const code = [
        "package payments",
        "",
        "import (",
        '    "context"',
        '    "os"',
        "",
        '    "github.com/stripe/stripe-go/v87"',
        '    "go.temporal.io/sdk/activity"',
        ")",
        "",
        "func ChargeCard(ctx context.Context, req ChargeRequest) (*ChargeResult, error) {",
        '    stripe.Key = os.Getenv("STRIPE_API_KEY")',
        '    activity.RecordHeartbeat(ctx, "charging")',
        "    return charge(req)",
        "}",
      ].join("\n");
      const snippets = generateSnippets(
        checkCode(code, registeredSdks),
        address,
      );
      expect(snippet(snippets, "workflow.go")).toContain(
        "func ChargeCardWorkflow(ctx workflow.Context, input ChargeRequest) (*ChargeResult, error) {",
      );
      expect(snippet(snippets, "start/main.go")).toContain(
        "    var result *app.ChargeResult\n",
      );
      expect(snippet(snippets, installLabel)).toBe(
        "go mod init charge-card\ngo get go.temporal.io/sdk\ngo get github.com/stripe/stripe-go/v87",
      );
      expect(snippet(snippets, runLabel)).toContain(
        "export STRIPE_API_KEY=...",
      );
      expect(snippet(snippets, "workflow.go")).toContain(
        "HeartbeatTimeout: 10 * time.Second,",
      );
    });

    it("names a Java activity's nested types through its interface in the workflow and starter", () => {
      const code = [
        "import io.temporal.activity.ActivityInterface;",
        "",
        "@ActivityInterface",
        "public interface Payments {",
        "    record ChargeRequest(long amount) {}",
        "    record ChargeResult(String id) {}",
        "",
        "    ChargeResult chargeCard(ChargeRequest request);",
        "}",
      ].join("\n");
      const snippets = generateSnippets(
        checkCode(code, registeredSdks),
        address,
      );
      expect(snippet(snippets, "ChargeCardWorkflow.java")).toContain(
        "Payments.ChargeResult run(Payments.ChargeRequest input)",
      );
      expect(snippet(snippets, "Starter.java")).toContain(
        "Payments.ChargeRequest input = null;",
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

  describe("the workflow sets the start-to-close timeout, and a heartbeat timeout only when the activity heartbeats", () => {
    const timeoutLines: Record<AcceptedSdk, string> = {
      Go: "workflow.ActivityOptions{\n        // Temporal requires a start-to-close timeout. Set it for your activity.\n        StartToCloseTimeout: 30 * time.Second,\n    })",
      Java: "            ActivityOptions.newBuilder()\n                    // Temporal requires a start-to-close timeout. Set it for your activity.\n                    .setStartToCloseTimeout(Duration.ofSeconds(30))\n                    .build());",
      Python:
        "            # Temporal requires a start-to-close timeout. Set it for your activity.\n            start_to_close_timeout=timedelta(seconds=30),\n        )",
      TypeScript:
        '({\n    // Temporal requires a start-to-close timeout. Set it for your activity.\n    startToCloseTimeout: "30 seconds",\n});',
      ".NET":
        "            {\n                // Temporal requires a start-to-close timeout. Set it for your activity.\n                StartToCloseTimeout = TimeSpan.FromSeconds(30),\n            });",
      Rust: "                input,\n                // Temporal requires a start-to-close timeout. Set it for your activity.\n                ActivityOptions::start_to_close_timeout(Duration::from_secs(30)),\n            )",
      Ruby: "            # Temporal requires a start-to-close timeout. Set it for your activity.\n            start_to_close_timeout: 30\n        )",
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

    const heartbeatComment =
      "The activity heartbeats. Temporal fails an attempt that sends no heartbeat within this timeout.";
    const heartbeatLines: Record<AcceptedSdk, string> = {
      Go: `        // ${heartbeatComment}
        HeartbeatTimeout: 10 * time.Second,
        // Temporal requires a start-to-close timeout.`,
      Java: `                    // ${heartbeatComment}
                    .setHeartbeatTimeout(Duration.ofSeconds(10))
                    // Temporal requires a start-to-close timeout.`,
      Python: `            # ${heartbeatComment}
            heartbeat_timeout=timedelta(seconds=10),
            # Temporal requires a start-to-close timeout.`,
      TypeScript: `    // ${heartbeatComment}
    heartbeatTimeout: "10 seconds",
    // Temporal requires a start-to-close timeout.`,
      ".NET": `                // ${heartbeatComment}
                HeartbeatTimeout = TimeSpan.FromSeconds(10),
                // Temporal requires a start-to-close timeout.`,
      Ruby: `            # ${heartbeatComment}
            heartbeat_timeout: 10,
            # Temporal requires a start-to-close timeout.`,
      PHP: `            ActivityOptions::new()
                ->withStartToCloseTimeout(30)
                // ${heartbeatComment}
                ->withHeartbeatTimeout(10),
        );`,
      Rust: `                ActivityOptions::with_start_to_close_timeout(Duration::from_secs(30))
                    // ${heartbeatComment}
                    .heartbeat_timeout(Duration::from_secs(10))
                    .build(),
            )`,
    };

    it.each(sdks)(
      "sets a 10-second heartbeat timeout, with the comment, when the %s activity heartbeats",
      (sdk) => {
        for (const input of ["ChargeRequest", null]) {
          expect(
            workflowFile(sdk, {
              input,
              heartbeats: [{ line: 9 }, { line: 12 }],
            }),
          ).toContain(heartbeatLines[sdk]);
        }
      },
    );

    it.each(sdks)(
      "sets no heartbeat timeout when the %s activity never heartbeats",
      (sdk) => {
        for (const input of ["ChargeRequest", null]) {
          expect(workflowFile(sdk, { input, heartbeats: [] })).not.toMatch(
            /heartbeat/i,
          );
        }
      },
    );

    it.each(sdks)(
      "changes only the workflow file when a %s activity heartbeats",
      (sdk) => {
        for (const input of ["ChargeRequest", null]) {
          const withHeartbeats = generateSnippets(
            factsFor(sdk, { input, heartbeats: [{ line: 9 }] }),
            address,
          );
          const without = generateSnippets(
            factsFor(sdk, { input, heartbeats: [] }),
            address,
          );
          const workflowLabel = fileLabels(sdk)[0];
          expect(
            withHeartbeats.filter(({ label }) => label !== workflowLabel),
          ).toEqual(without.filter(({ label }) => label !== workflowLabel));
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
      ["Go", "go mod init charge-card\ngo get go.temporal.io/sdk"],
      [
        "Java",
        "<!-- Add this to the <dependencies> section of your pom.xml. -->\n<dependency>\n    <groupId>io.temporal</groupId>\n    <artifactId>temporal-sdk</artifactId>\n    <version>1.40.0</version>\n</dependency>",
      ],
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
        '# The Temporal Rust SDK needs protoc to build: install the Protocol Buffers compiler first.\n[dependencies]\nfutures = "0.3"\nserde = { version = "1", features = ["derive"] }\ntemporalio-client = "1.0.0"\ntemporalio-common = "1.0.0"\ntemporalio-macros = "1.0.0"\ntemporalio-sdk = "1.0.0"\ntemporalio-workflow = "1.0.0"\ntokio = { version = "1", features = ["full"] }',
      ],
      [
        "PHP",
        "composer require temporal/sdk\n./vendor/bin/rr get\n# RoadRunner needs PHP's grpc extension. Install it with: pecl install grpc",
      ],
      ["Ruby", "bundle add temporalio"],
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
      ["Go", "activity.go"],
      ["Java", "Activities.java"],
      ["Python", "activities.py"],
      ["TypeScript", "activities.ts"],
      [".NET", "Activities.cs"],
      ["Rust", "activities.rs"],
      ["Ruby", "activities.rb"],
      ["PHP", "Activities.php"],
    ] as const)(
      "names the %s activity file %s, the file the workflow and worker import",
      (sdk, fileName) => {
        expect(sdkRegistry[sdk].display.activityFileName).toBe(fileName);
        const importsActivityFile = {
          Go: "ChargeCard",
          Java: "Activities",
          Python: "from activities import",
          TypeScript: 'from "./activities"',
          ".NET": "activities.ChargeCardAsync",
          Rust: "use crate::activities::",
          Ruby: 'require_relative "activities"',
          PHP: "Activities::class",
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
      expect(install.split("\n")[0]).toMatch(/^# .*protoc/);
      expect(install.split("\n")[1]).toBe("[dependencies]");
      expect(install).toContain('temporalio-sdk = "1.0.0"');
      expect(install).not.toMatch(/cargo add/);
      // serde and tokio are already in the fragment, so the note leaves them out.
      expect(install.split("\n").at(-1)).toBe(
        "# Also add the crates that provide: aws-sdk-s3, slack-morphism",
      );
    });

    it("names an integration crate as Cargo.toml names it, and any other crate as it is used", () => {
      const install = snippet(
        rustSnippets({
          dependencies: [
            { name: "tokio_postgres", line: 1 },
            { name: "stripe", line: 2 },
            { name: "reqwest", line: 3 },
          ],
        }),
        installLabel,
      );
      // stripe stays as used: its code comes from async-stripe, and a crate named stripe is
      // someone else's.
      expect(install.split("\n").at(-1)).toBe(
        "# Also add the crates that provide: tokio-postgres, stripe, reqwest",
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
        "    handle.get_result(WorkflowGetResultOptions::default()).await?;\n    Ok(())",
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

describe("Ruby snippets", () => {
  const ruby = (changes: Partial<FactValues> = {}, at: Address = address) =>
    generateSnippets(factsFor("Ruby", changes), at);

  it("installs the SDK with bundle add, and names each detected require without adding it", () => {
    expect(snippet(ruby(), installLabel)).toBe(
      "bundle add temporalio\n# Also add the gems that provide: stripe",
    );
    const install = snippet(
      ruby({
        dependencies: [
          { name: "aws-sdk-s3", line: 1 },
          { name: "active_support/core_ext", line: 2 },
        ],
      }),
      installLabel,
    );
    expect(install).toBe(
      "bundle add temporalio\n# Also add the gems that provide: aws-sdk-s3, active_support/core_ext",
    );
    expect(
      install.split("\n").filter((line) => line.startsWith("bundle add")),
    ).toEqual(["bundle add temporalio"]);
  });

  it("writes every file in Ruby, named for Ruby", () => {
    const snippets = ruby();
    expect(snippets.map(({ label }) => label)).toEqual([
      installLabel,
      "workflow.rb",
      "worker.rb",
      "starter.rb",
      runLabel,
    ]);
    for (const { code } of files(snippets)) {
      expect(code).toMatch(/^require "temporalio\/(?:workflow|client)"$/m);
      expect(code).not.toMatch(/[;{]$/m);
    }
    expect(snippet(snippets, runLabel)).toContain("bundle exec ruby worker.rb");
  });

  it("passes the activity its input and notes the input's type", () => {
    const workflow = snippet(ruby(), "workflow.rb");
    expect(workflow).toContain(
      "    # input is the ChargeRequest to pass to ChargeCard.\n    def execute(input)\n",
    );
    expect(workflow).toContain("            ChargeCard,\n            input,\n");
  });

  it("passes the arguments through when detection couldn't read the input", () => {
    const snippets = ruby({ input: null });
    const workflow = snippet(snippets, "workflow.rb");
    expect(workflow).toContain("    def execute(*args)\n");
    expect(workflow).toContain(
      "        # Detection couldn't read what ChargeCard takes. Fill in its arguments,\n",
    );
    expect(workflow).toContain("            ChargeCard,\n            *args,\n");
    const starter = snippet(snippets, "starter.rb");
    expect(starter).toContain(
      "# Fill in the arguments ChargeCard takes, in order.\nargs = []\n",
    );
    expect(starter).toContain("    ChargeCardWorkflow,\n    *args,\n");
  });

  it.each(["sync", "async", null] as const)(
    "sets up no activity executor or thread pool in the worker when Runs as is %s",
    (runsAs) => {
      const worker = snippet(ruby({ runsAs }), "worker.rb");
      expect(worker).not.toMatch(/executor|thread[ _]?pool/i);
      expect(worker).toContain("    activities: [ChargeCard]\n");
    },
  );

  it("names the workflow after the activity class, without its namespace or an Activity ending", () => {
    const named = (name: string) =>
      snippet(ruby({ activity: { name, line: 1 } }), "workflow.rb");
    expect(named("Billing::ChargeCardActivity")).toContain(
      "class ChargeCardWorkflow < Temporalio::Workflow::Definition",
    );
    expect(named("Billing::ChargeCardActivity")).toContain(
      "            Billing::ChargeCardActivity,\n",
    );
    expect(named("Activity")).toContain(
      "class ActivityWorkflow < Temporalio::Workflow::Definition",
    );
  });

  it("escapes quotes, backslashes and interpolation in the address", () => {
    const starter = snippet(
      ruby({}, { handle: "kris", name: 'a"b#{c}\\', version: "1.0.0" }),
      "starter.rb",
    );
    expect(starter).toContain(
      String.raw`    id: "a\"b\#{c}\\-#{SecureRandom.uuid}",`,
    );
    expect(starter).toContain(String.raw`    task_queue: "a\"b\#{c}\\"`);
  });

  it("generates from a detected Ruby activity", () => {
    const code = [
      'require "stripe"',
      'require "temporalio/activity"',
      "",
      "class ChargeCard < Temporalio::Activity::Definition",
      "    sig { params(input: ChargeRequest).returns(ChargeResult) }",
      "    def execute(input)",
      '        Stripe.api_key = ENV.fetch("STRIPE_API_KEY")',
      "    end",
      "end",
    ].join("\n");
    expect(generateSnippets(checkCode(code, registeredSdks), address)).toEqual(
      expectedSnippets.Ruby,
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
