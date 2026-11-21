import type { Integration } from "@durables/schemas";
import { sdkRegistry } from "../sdks/registry";
import type { Sdk } from "../sdks/sdk-list";
import type { NamedLineRef } from "./facts";

// "Integrates with" is what detection can tell from the code's imports (PM decision,
// 2026-10-08). A package on this list implies its integration. Any other package, including a
// plain HTTP client, implies none. Publishers don't enter integrations.

interface IntegrationPackages {
  readonly integration: Integration;
  /**
   * The integration keys of this integration's client libraries: package names for Python and
   * TypeScript, the namespace root of a `using` for .NET (its first two parts under the AWS SDK's
   * `Amazon`, such as `Amazon.S3`), the import path before any
   * major-version suffix for Go, a package's organisation or AWS service for Java, the
   * package-level namespace for PHP, such as `Aws\S3`, gem names for Ruby and crate names for
   * Rust. A dependency implies the integration when its SDK's normaliser gives it the same key
   * as one of these, or, for a PHP namespace, a namespace inside one of them.
   */
  readonly packages: readonly string[];
  /**
   * Integration keys that imply the integration in one SDK only, because the same name in
   * another SDK is a different library: npm's `groq` is Sanity's query language, not Groq.
   */
  readonly sdkPackages?: Partial<Record<Sdk, readonly string[]>>;
}

/**
 * Each integration in the shared list and the packages that imply it, in the order a
 * listing's integrations are stored. Package names are matched without regard to case.
 */
export const integrationPackages: readonly IntegrationPackages[] = [
  {
    integration: "Amazon S3",
    packages: [
      "boto3",
      "@aws-sdk/client-s3",
      "github.com/aws/aws-sdk-go-v2/service/s3",
      "github.com/aws/aws-sdk-go/service/s3",
      "software.amazon.awssdk.services.s3",
      "com.amazonaws.services.s3",
      "Amazon.S3",
      "Aws\\S3",
      "aws-sdk-s3",
      "rusoto_s3",
    ],
  },
  {
    integration: "Postgres",
    packages: [
      "psycopg",
      "psycopg2",
      "asyncpg",
      "pg",
      "Npgsql",
      "github.com/jackc/pgx",
      "github.com/lib/pq",
      "org.postgresql",
      "Amp\\Postgres",
      "tokio-postgres",
    ],
  },
  {
    integration: "Slack",
    packages: [
      "slack_sdk",
      "@slack/web-api",
      "SlackNet",
      "github.com/slack-go/slack",
      "com.slack",
      "JoliCode\\Slack",
      "slack-ruby-client",
      "slack-morphism",
    ],
  },
  // "stripe" is also the Stripe.net package's .NET namespace root, stripe-php's namespace, the
  // Ruby gem, and the crate name Rust code uses async-stripe by.
  {
    integration: "Stripe",
    packages: [
      "stripe",
      "github.com/stripe/stripe-go",
      "com.stripe",
      "async-stripe",
    ],
  },
  // AI model providers: a chip names the provider whose client is imported. "openai" is the
  // Python, npm and Ruby package, the .NET namespace root and openai-php's namespace;
  // async-openai is Rust's most used OpenAI crate (there is no official one). The Codex SDK
  // (openai-codex, imported as openai_codex, and @openai/codex-sdk) runs only OpenAI's Codex.
  {
    integration: "OpenAI",
    packages: [
      "openai",
      "openai_codex",
      "@openai/codex-sdk",
      "github.com/openai/openai-go",
      "com.openai",
      "async-openai",
    ],
  },
  // "anthropic" is the Python package, Ruby gem, .NET namespace root and the PHP SDK's
  // namespace. Rust has no official crate; misanthropic and clust are community clients. The
  // Claude Agent SDK (claude-agent-sdk, imported as claude_agent_sdk, and
  // @anthropic-ai/claude-agent-sdk) runs only Claude.
  {
    integration: "Anthropic Claude",
    packages: [
      "anthropic",
      "@anthropic-ai/sdk",
      "claude_agent_sdk",
      "@anthropic-ai/claude-agent-sdk",
      "github.com/anthropics/anthropic-sdk-go",
      "com.anthropic",
      "misanthropic",
      "clust",
    ],
  },
  // The Google Gen AI SDKs, as Python (google.genai), npm, Go, Java (com.google.genai) and .NET
  // (Google.GenAI) name them. PHP, Ruby and Rust have no official client: google-gemini-php's
  // namespace Gemini, the gemini-ai gem and the gemini-rust crate are community ones.
  {
    integration: "Google Gemini",
    packages: [
      "google.genai",
      "@google/genai",
      "google.golang.org/genai",
      "com.google.genai",
      "Google.GenAI",
      "Gemini",
      "gemini-ai",
      "gemini-rust",
    ],
  },
  // The AWS SDKs' Bedrock runtime clients. boto3 is not listed: it is the AWS SDK for every
  // service, and it already implies Amazon S3. Python's Bedrock-only client is AWS's
  // aws-sdk-bedrock-runtime, imported as aws_sdk_bedrock_runtime.
  {
    integration: "Amazon Bedrock",
    packages: [
      "aws_sdk_bedrock_runtime",
      "@aws-sdk/client-bedrock-runtime",
      "github.com/aws/aws-sdk-go-v2/service/bedrockruntime",
      "software.amazon.awssdk.services.bedrockruntime",
      "Amazon.BedrockRuntime",
      "Aws\\BedrockRuntime",
      "aws-sdk-bedrockruntime",
    ],
  },
  // Redis clients: redis (Python, npm's node-redis, the Ruby gem, the Rust crate), ioredis,
  // go-redis, Jedis and Lettuce (Java), StackExchange.Redis (.NET) and Predis (PHP).
  {
    integration: "Redis",
    packages: [
      "redis",
      "ioredis",
      "github.com/redis/go-redis",
      "redis.clients",
      "io.lettuce",
      "StackExchange.Redis",
      "Predis",
    ],
  },
  // The AWS SDKs' SQS clients. As with Bedrock, boto3 is not listed: it already implies S3.
  // Python's SQS-only client is AWS's aws-sdk-sqs, imported as aws_sdk_sqs.
  {
    integration: "Amazon SQS",
    packages: [
      "aws_sdk_sqs",
      "@aws-sdk/client-sqs",
      "github.com/aws/aws-sdk-go-v2/service/sqs",
      "software.amazon.awssdk.services.sqs",
      "Amazon.SQS",
      "Aws\\Sqs",
      "aws-sdk-sqs",
    ],
  },
  // Ollama clients: ollama (Python, npm, and the ollama-ruby gem's require), the Go client
  // inside Ollama's own module, ollama4j, OllamaSharp, tryAGI's Ollama (.NET), ollama-php's
  // ArdaGnsrn\Ollama and ollama-rs.
  {
    integration: "Ollama",
    packages: [
      "ollama",
      "github.com/ollama/ollama/api",
      "io.github.ollama4j",
      "OllamaSharp",
      "ArdaGnsrn\\Ollama",
      "ollama-rs",
    ],
  },
  // Cohere's own clients (Python, npm, Go, Java), tryAGI's Cohere (.NET) and the cohere-ruby
  // gem, required as "cohere".
  {
    integration: "Cohere",
    packages: [
      "cohere",
      "cohere-ai",
      "github.com/cohere-ai/cohere-go",
      "com.cohere",
    ],
  },
  // Groq's own clients are groq (Python) and groq-sdk (npm). npm's groq is Sanity's GROQ query
  // language, so groq implies Groq in Python only, as does tryAGI's Groq namespace in .NET.
  {
    integration: "Groq",
    packages: [
      "groq-sdk",
      "GroqApiLibrary",
      "LucianoTonet\\GroqPHP",
      "groq-api-rust",
    ],
    sdkPackages: { Python: ["groq"], ".NET": ["Groq"] },
  },
  // xAI's own clients are xai-sdk (Python, imported as xai_sdk) and @xai-official/sdk, also
  // published as @grok/sdk. Go, .NET and Rust clients are community ones. PyPI's xai is an
  // explainable-AI library, so the xAI namespace implies xAI Grok in .NET only. grok is never
  // a key: it is a log-parsing library in most registries.
  {
    integration: "xAI Grok",
    packages: [
      "xai_sdk",
      "xai-sdk",
      "@xai-official/sdk",
      "@grok/sdk",
      "github.com/ZaguanLabs/xai-sdk-go/xai",
      "xai-grpc-client",
    ],
    sdkPackages: { ".NET": ["xAI"] },
  },
];

/** A PHP namespace's separator. No other SDK's integration keys contain it. */
const namespaceSeparator = "\\";

/**
 * Whether an imported key is the package key, or a PHP namespace inside it: `stripe\exception`
 * is inside `stripe`.
 */
const isWithin = (imported: string, key: string) =>
  imported === key || imported.startsWith(`${key}${namespaceSeparator}`);

/**
 * The integrations an SDK's detected third-party imports imply, each once. Each dependency and
 * each package goes through the SDK's normaliser, so the two compare as that SDK reads them.
 * The order is the order of `integrationPackages`, whatever order the imports came in. Empty
 * when no import implies an integration.
 */
export const integrationsFor = (
  sdk: Sdk,
  dependencies: readonly Pick<NamedLineRef, "name">[],
): Integration[] => {
  const { normaliseDependency } = sdkRegistry[sdk];
  const imported = dependencies.map(({ name }) => normaliseDependency(name));
  return integrationPackages
    .filter(({ packages, sdkPackages }) =>
      [...packages, ...(sdkPackages?.[sdk] ?? [])].some((name) =>
        imported.some((key) => isWithin(key, normaliseDependency(name))),
      ),
    )
    .map(({ integration }) => integration);
};
