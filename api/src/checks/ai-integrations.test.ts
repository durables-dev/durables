import { describe, expect, it } from "vitest";
import { registeredSdks } from "../sdks/registry";
import type { Sdk } from "../sdks/sdk-list";
import { integrationsFor } from "./integrations";
import { checkCode } from "./pipeline";

// The AI provider chips, read the way a published file is: each case is a whole activity file
// for its SDK that imports one provider's client, run through detection and then the
// integration list. Each import is how that SDK's current client is written.

/** A one-activity file for the SDK that starts with the given import line. */
const activityFile = (sdk: Sdk, importLine: string): string => {
  switch (sdk) {
    case "Python":
      return [
        importLine,
        "from temporalio import activity",
        "",
        "@activity.defn",
        "async def generate(prompt: str) -> str:",
        "    return prompt",
      ].join("\n");
    case "TypeScript":
      return [
        importLine,
        'import { Context } from "@temporalio/activity";',
        "",
        "export async function generate(prompt: string): Promise<string> {",
        "  Context.current().heartbeat();",
        "  return prompt;",
        "}",
      ].join("\n");
    case "Go":
      return [
        "package ai",
        "",
        "import (",
        '    "context"',
        "",
        `    ${importLine}`,
        '    "go.temporal.io/sdk/activity"',
        ")",
        "",
        "func Generate(ctx context.Context, prompt string) (string, error) {",
        "    activity.RecordHeartbeat(ctx)",
        "    return prompt, nil",
        "}",
      ].join("\n");
    case "Java":
      return [
        importLine,
        "import io.temporal.activity.ActivityInterface;",
        "",
        "@ActivityInterface",
        "public interface Generator {",
        "    String generate(String prompt);",
        "}",
      ].join("\n");
    case ".NET":
      return [
        importLine,
        "using Temporalio.Activities;",
        "",
        "public class Generator",
        "{",
        "    [Activity]",
        "    public Task<string> GenerateAsync(string prompt) => Task.FromResult(prompt);",
        "}",
      ].join("\n");
    case "PHP":
      return [
        "<?php",
        "",
        "namespace App;",
        "",
        importLine,
        "use Temporal\\Activity\\ActivityInterface;",
        "use Temporal\\Activity\\ActivityMethod;",
        "",
        "#[ActivityInterface]",
        "class Generator",
        "{",
        "    #[ActivityMethod]",
        "    public function generate(string $prompt): string",
        "    {",
        "        return $prompt;",
        "    }",
        "}",
      ].join("\n");
    case "Ruby":
      return [
        importLine,
        'require "temporalio/activity"',
        "",
        "class GenerateActivity < Temporalio::Activity::Definition",
        "  def execute(prompt)",
        "    prompt",
        "  end",
        "end",
      ].join("\n");
    case "Rust":
      return [
        importLine,
        "use temporalio_macros::activities;",
        "use temporalio_sdk::activities::{ActivityContext, ActivityError};",
        "",
        "pub struct Activities;",
        "",
        "#[activities]",
        "impl Activities {",
        "    #[activity]",
        "    pub async fn generate(_ctx: ActivityContext, prompt: String) -> Result<String, ActivityError> {",
        "        Ok(prompt)",
        "    }",
        "}",
      ].join("\n");
  }
};

const integrationsOf = (sdk: Sdk, importLine: string) => {
  const facts = checkCode(activityFile(sdk, importLine), registeredSdks);
  expect(facts.sdk).toBe(sdk);
  return integrationsFor(facts.sdk, facts.dependencies);
};

describe("the AI provider chips, from each SDK's client", () => {
  it.each<[Sdk, string, string]>([
    ["Python", "from openai import AsyncOpenAI", "OpenAI"],
    ["Python", "import anthropic", "Anthropic Claude"],
    ["Python", "from google import genai", "Google Gemini"],
    ["Python", "from google.genai import types", "Google Gemini"],
    ["Python", "import google.genai as genai", "Google Gemini"],
    [
      "Python",
      "from aws_sdk_bedrock_runtime.client import BedrockRuntimeClient",
      "Amazon Bedrock",
    ],
    ["TypeScript", 'import OpenAI from "openai";', "OpenAI"],
    [
      "TypeScript",
      'import Anthropic from "@anthropic-ai/sdk";',
      "Anthropic Claude",
    ],
    [
      "TypeScript",
      'import { GoogleGenAI } from "@google/genai";',
      "Google Gemini",
    ],
    [
      "TypeScript",
      'import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";',
      "Amazon Bedrock",
    ],
    ["Go", '"github.com/openai/openai-go/v3"', "OpenAI"],
    ["Go", '"github.com/anthropics/anthropic-sdk-go/v2"', "Anthropic Claude"],
    ["Go", '"google.golang.org/genai"', "Google Gemini"],
    [
      "Go",
      '"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"',
      "Amazon Bedrock",
    ],
    ["Java", "import com.openai.client.OpenAIClient;", "OpenAI"],
    [
      "Java",
      "import com.anthropic.client.AnthropicClient;",
      "Anthropic Claude",
    ],
    ["Java", "import com.google.genai.Client;", "Google Gemini"],
    [
      "Java",
      "import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;",
      "Amazon Bedrock",
    ],
    [".NET", "using OpenAI.Chat;", "OpenAI"],
    [".NET", "using Anthropic;", "Anthropic Claude"],
    [".NET", "using Google.GenAI;", "Google Gemini"],
    [".NET", "using Amazon.BedrockRuntime;", "Amazon Bedrock"],
    ["PHP", "use OpenAI\\Client;", "OpenAI"],
    ["PHP", "use Anthropic\\Client;", "Anthropic Claude"],
    ["PHP", "use Gemini\\Client;", "Google Gemini"],
    ["PHP", "use Aws\\BedrockRuntime\\BedrockRuntimeClient;", "Amazon Bedrock"],
    ["Ruby", 'require "openai"', "OpenAI"],
    ["Ruby", 'require "anthropic"', "Anthropic Claude"],
    ["Ruby", 'require "gemini-ai"', "Google Gemini"],
    ["Ruby", 'require "aws-sdk-bedrockruntime"', "Amazon Bedrock"],
    ["Rust", "use async_openai::Client;", "OpenAI"],
    ["Rust", "use misanthropic::Client;", "Anthropic Claude"],
    ["Rust", "use clust::Client;", "Anthropic Claude"],
    ["Rust", "use gemini_rust::Gemini;", "Google Gemini"],
    ["Rust", "use aws_sdk_bedrockruntime::Client;", "Amazon Bedrock"],
  ])("reads %s %s as %s", (sdk, importLine, integration) => {
    expect(integrationsOf(sdk, importLine)).toEqual([integration]);
  });

  it.each<[Sdk, string]>([
    ["Python", "from google.cloud import storage"],
    ["Java", "import com.google.common.collect.ImmutableList;"],
    [".NET", "using Google.Cloud.Storage.V1;"],
  ])(
    "reads no AI chip from %s %s, another product in a shared namespace",
    (sdk, importLine) => {
      expect(integrationsOf(sdk, importLine)).toEqual([]);
    },
  );

  it.each<[Sdk, string, string]>([
    ["Python", "import redis.asyncio as redis", "Redis"],
    ["TypeScript", 'import { createClient } from "redis";', "Redis"],
    ["TypeScript", 'import Redis from "ioredis";', "Redis"],
    ["Go", '"github.com/redis/go-redis/v9"', "Redis"],
    ["Java", "import redis.clients.jedis.UnifiedJedis;", "Redis"],
    ["Java", "import io.lettuce.core.RedisClient;", "Redis"],
    [".NET", "using StackExchange.Redis;", "Redis"],
    ["PHP", "use Predis\\Client;", "Redis"],
    ["Ruby", 'require "redis"', "Redis"],
    ["Rust", "use redis::AsyncCommands;", "Redis"],
    ["Python", "from aws_sdk_sqs.client import SQSClient", "Amazon SQS"],
    [
      "TypeScript",
      'import { SQSClient } from "@aws-sdk/client-sqs";',
      "Amazon SQS",
    ],
    ["Go", '"github.com/aws/aws-sdk-go-v2/service/sqs"', "Amazon SQS"],
    [
      "Java",
      "import software.amazon.awssdk.services.sqs.SqsClient;",
      "Amazon SQS",
    ],
    [".NET", "using Amazon.SQS;", "Amazon SQS"],
    ["PHP", "use Aws\\Sqs\\SqsClient;", "Amazon SQS"],
    ["Ruby", 'require "aws-sdk-sqs"', "Amazon SQS"],
    ["Rust", "use aws_sdk_sqs::Client;", "Amazon SQS"],
  ])("reads %s %s as %s", (sdk, importLine, integration) => {
    expect(integrationsOf(sdk, importLine)).toEqual([integration]);
  });

  it("keeps boto3 on Amazon S3 only, so a Python Bedrock listing needs AWS's Bedrock client", () => {
    expect(integrationsOf("Python", "import boto3")).toEqual(["Amazon S3"]);
  });
});
