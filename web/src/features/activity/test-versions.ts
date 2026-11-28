import type { ImplementVersion } from "./implement-steps";
import type { VersionResponse } from "@/lib/listing-queries";

// Versions as the API answers them, one per SDK, for the Implement tests. The snippets follow
// the API's generated shapes and order: install, workflow, worker, starter, then run.

export interface TestVersion extends ImplementVersion {
  sdk: VersionResponse["sdk"];
}

/** Published Python with odd indentation, tabs and trailing spaces, kept exactly as is. */
export const pythonCode = [
  "import os",
  "from temporalio import activity",
  "",
  "@activity.defn",
  "def charge_card(request: ChargeRequest) -> ChargeResult:",
  "  key = os.environ['STRIPE_API_KEY']   ",
  "\treturn ChargeResult(charge(key, request))",
  "",
].join("\n");

export const python: TestVersion = {
  sdk: "Python",
  address: "ddieruf/charge-card@1.0.0",
  code: pythonCode,
  activityFileName: "activities.py",
  snippets: [
    {
      label: "Install",
      code: "pip install temporalio\n# Also install the PyPI packages that provide: stripe",
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
        "    result = await client.execute_workflow(",
        "        ChargeCardWorkflow.run,",
        "        ChargeRequest(),",
        '        id=f"charge-card-{uuid.uuid4()}",',
        '        task_queue="charge-card",',
        "    )",
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
};

export const typescript: TestVersion = {
  sdk: "TypeScript",
  address: "ddieruf/send-email@1.0.0",
  code: "export async function sendEmail(input: EmailInput): Promise<string> {\n  return send(input);\n}\n",
  activityFileName: "activities.ts",
  snippets: [
    {
      label: "Install",
      code: "npm install @temporalio/activity @temporalio/client @temporalio/worker @temporalio/workflow nodemailer",
    },
    {
      label: "workflows.ts",
      code: 'import { proxyActivities } from "@temporalio/workflow";\nimport type * as activities from "./activities";',
    },
    {
      label: "worker.ts",
      code: 'import { Worker } from "@temporalio/worker";\nimport * as activities from "./activities";',
    },
    {
      label: "start.ts",
      code: 'import { Client } from "@temporalio/client";\nimport { sendEmailWorkflow } from "./workflows";',
    },
    {
      label: "Run",
      code: "temporal server start-dev\nexport SMTP_HOST=...\nnpx tsx worker.ts\nnpx tsx start.ts",
    },
  ],
};

export const dotnet: TestVersion = {
  sdk: ".NET",
  address: "ddieruf/resize-image@1.0.0",
  code: "public class Activities\n{\n    [Activity]\n    public Task<string> ResizeImage(ResizeRequest request) => Resize(request);\n}\n",
  activityFileName: "Activities.cs",
  snippets: [
    {
      label: "Install",
      code: "dotnet new console --output ResizeImage\ncd ResizeImage\ndotnet add package Temporalio\n# Also add the NuGet packages that provide: SixLabors.ImageSharp",
    },
    {
      label: "ResizeImageWorkflow.cs",
      code: "using Temporalio.Workflows;\n\n[Workflow]\npublic class ResizeImageWorkflow\n{\n}",
    },
    {
      label: "Program.cs",
      code: "using Temporalio.Client;\nusing Temporalio.Worker;",
    },
    {
      label: "Starter.cs",
      code: "using Temporalio.Client;\n\npublic static class Starter\n{\n}",
    },
    {
      label: "Run",
      code: "temporal server start-dev\ndotnet run\ndotnet run -- start",
    },
  ],
};

/** A Python version whose code reads no environment variables: no export line in Run. */
export const pythonWithoutEnvironment: TestVersion = {
  ...python,
  snippets: python.snippets.map((snippet) =>
    snippet.label === "Run"
      ? {
          label: "Run",
          code: "temporal server start-dev\npython worker.py\npython start.py",
        }
      : snippet,
  ),
};

/**
 * A PHP version as the api answers it: install, the workflow, worker and starter files, run,
 * then the RoadRunner config the worker needs.
 */
export const php: TestVersion = {
  sdk: "PHP",
  address: "ddieruf/charge-card@1.0.0",
  code: "<?php\n\nclass Activities\n{\n    public function chargeCard(string $input): string\n    {\n        return $input;\n    }\n}\n",
  activityFileName: "Activities.php",
  snippets: [
    {
      label: "Install",
      code: "composer require temporal/sdk\n./vendor/bin/rr get\n# RoadRunner needs PHP's grpc extension. Install it with: pecl install grpc",
    },
    {
      label: "ChargeCardWorkflow.php",
      code: "<?php\n\ndeclare(strict_types=1);\n\nclass ChargeCardWorkflow\n{\n}",
    },
    {
      label: "worker.php",
      code: "<?php\n\ndeclare(strict_types=1);\n\nuse Temporal\\WorkerFactory;\n\n$factory = WorkerFactory::create();\n$factory->run();",
    },
    {
      label: "starter.php",
      code: "<?php\n\ndeclare(strict_types=1);\n\nrequire 'vendor/autoload.php';",
    },
    {
      label: "Run",
      code: "temporal server start-dev\n./rr serve\nphp starter.php",
    },
    {
      label: ".rr.yaml",
      code: 'version: "3"\nrpc:\n    listen: tcp://127.0.0.1:6001\nserver:\n    command: "php worker.php"\ntemporal:\n    address: "127.0.0.1:7233"\nlogs:\n    level: info',
    },
  ],
};

/** A published activity in each new SDK, with the catalog's highlight language for it. */
export const newSdkSamples = [
  {
    sdk: "Go",
    highlightLanguage: "go",
    activityFileName: "activities.go",
    code: 'package activities\n\nfunc ChargeCard(ctx context.Context, input Charge) (string, error) {\n    return "ok", nil\n}\n',
  },
  {
    sdk: "Java",
    highlightLanguage: "java",
    activityFileName: "ActivitiesImpl.java",
    code: "public class ActivitiesImpl implements Activities {\n    @Override\n    public String charge(String input) {\n        return input;\n    }\n}\n",
  },
  {
    sdk: "Ruby",
    highlightLanguage: "ruby",
    activityFileName: "activities.rb",
    code: "class ChargeCard < Temporalio::Activity::Definition\n    def execute(input)\n        'ok'\n    end\nend\n",
  },
  {
    sdk: "PHP",
    highlightLanguage: "php",
    activityFileName: php.activityFileName,
    code: php.code,
  },
  {
    sdk: "Rust",
    highlightLanguage: "rust",
    activityFileName: "activities.rs",
    code: "pub async fn charge_card(input: Charge) -> Result<String, Error> {\n    let id = input.id;\n    Ok(id)\n}\n",
  },
] as const;

/**
 * ddieruf/charge-card's listing as the API answers it: listed in search, with the given chips
 * (none by default), and each version, newest first, with the same description and no
 * deprecation.
 */
export function chargeCardListing(
  description: string,
  versions: string[] = ["1.0.0"],
  chips: string[] = [],
) {
  return {
    handle: "ddieruf",
    name: "charge-card",
    removedBy: null,
    chips,
    versions: versions.map((version) => ({
      version,
      publishedAt: new Date().toISOString(),
      whatChanged: null,
      basedOn: null,
      deprecation: null,
      description,
    })),
  };
}
