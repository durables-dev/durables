import { registeredSdks, sdkRegistry } from "../sdks/registry";
import { describe, expect, it } from "vitest";
import { dotnetDetector, dotnetPatterns } from "./dotnet-detector";
import type { ActivityFacts } from "./facts";
import { checkCode } from "./pipeline";
import { CheckRefusal, refusalTypes } from "./refusals";
import { toSource } from "./source";

const detect = (code: string) => dotnetDetector.detect(toSource(code));

const lines = (...code: string[]) => code.join("\n");

/** The Problem Details body of the refusal the pipeline throws for the code. */
const refusalOf = (code: string) => {
  try {
    checkCode(code, registeredSdks);
  } catch (error) {
    expect(error).toBeInstanceOf(CheckRefusal);
    return (error as CheckRefusal).problem;
  }
  throw new Error("Expected a refusal");
};

/** The only activity detected in the code. Fails the test if there isn't exactly one. */
const onlyActivity = (code: string): ActivityFacts => {
  const found = detect(code);
  expect(found).toHaveLength(1);
  const [only] = found;
  if (only === undefined) {
    throw new Error("Expected one activity");
  }
  return only;
};

/** A minimal activity with the given body lines, which start on line 8. */
const activityWith = (...body: string[]) =>
  lines(
    "using Temporalio.Activities;",
    "",
    "public class Activities",
    "{",
    "    [Activity]",
    "    public async Task<Out> Act(In input)",
    "    {",
    ...body,
    "        return new Out();",
    "    }",
    "}",
  );

/** A class holding the given members, under a Temporalio using. Members start on line 5. */
const classWith = (...members: string[]) =>
  lines(
    "using Temporalio.Activities;",
    "",
    "public class Activities",
    "{",
    ...members,
    "}",
  );

// A .NET counterpart to the canvas's charge_card sample: async, with every fact present.
const chargeCard = lines(
  "using System.Net.Http;",
  "using Microsoft.Extensions.Logging;",
  "using Stripe;",
  "using Temporalio.Activities;",
  "using Temporalio.Exceptions;",
  "",
  "namespace Payments;",
  "",
  "public record ChargeRequest(string RequestId, long AmountCents, string Currency, string PaymentMethod);",
  "",
  "public record ChargeResult(string ChargeId, string Status);",
  "",
  "public class PaymentActivities",
  "{",
  "    private static readonly string ApiKey =",
  '        Environment.GetEnvironmentVariable("STRIPE_API_KEY") ?? "";',
  "",
  "    [Activity]",
  "    public async Task<ChargeResult> ChargeCardAsync(ChargeRequest input)",
  "    {",
  "        ActivityExecutionContext.Current.Heartbeat();",
  "        try",
  "        {",
  "            var intent = await new PaymentIntentService().CreateAsync(new()",
  "            {",
  "                Amount = input.AmountCents,",
  "                Currency = input.Currency,",
  "                PaymentMethod = input.PaymentMethod,",
  "                Confirm = true,",
  "            });",
  "            return new ChargeResult(intent.Id, intent.Status);",
  "        }",
  "        catch (StripeException err)",
  "        {",
  "            throw new ApplicationFailureException(",
  '                $"Card declined: {err.Message}",',
  '                errorType: "CardDeclined",',
  "                nonRetryable: true);",
  "        }",
  "    }",
  "}",
);

describe("dotnetDetector", () => {
  describe("the patterns", () => {
    it("are named, unique, documented and stateless", () => {
      const names = dotnetPatterns.map((pattern) => pattern.name);
      expect(new Set(names).size).toBe(names.length);
      for (const pattern of dotnetPatterns) {
        expect(pattern.name).toMatch(/^dotnet(?:-[a-z]+)+$/);
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
      }
    });

    it("are registered with the pipeline", () => {
      expect(sdkRegistry[".NET"].detector).toBe(dotnetDetector);
    });
  });

  describe("an async activity returning Task<T> with typed input", () => {
    it("populates all eight facts", () => {
      expect(checkCode(chargeCard, registeredSdks)).toEqual({
        sdk: ".NET",
        activity: { name: "ChargeCardAsync", line: 19 },
        input: "ChargeRequest",
        output: "ChargeResult",
        runsAs: "async",
        nonRetryableErrors: [{ line: 38 }],
        configurationRead: [{ name: "STRIPE_API_KEY", line: 16 }],
        dependencies: [{ name: "Stripe", line: 3 }],
        heartbeats: [{ line: 21 }],
      });
    });

    it("reads a signature split across lines, with stacked attributes and comments", () => {
      const code = classWith(
        "    [Activity]",
        "    // Posts the message.",
        "    [Traced]",
        "    public async Task<MessageRef>",
        "        PostSlackMessageAsync(",
        "            SlackMessage input)",
        "    {",
        "        return new MessageRef();",
        "    }",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "PostSlackMessageAsync", line: 9 },
        input: "SlackMessage",
        output: "MessageRef",
        runsAs: "async",
      });
    });

    it("reads an attribute sharing its line or its brackets with the method and other attributes", () => {
      expect(
        onlyActivity(
          classWith(
            "    [Activity] public Task<Out> Act(In input) => Run(input);",
          ),
        ),
      ).toMatchObject({ activity: { name: "Act", line: 5 } });
      expect(
        onlyActivity(
          classWith(
            '    [Obsolete("old"), Temporalio.Activities.ActivityAttribute]',
            "    public Task<Out> Act(In input) => Run(input);",
          ),
        ),
      ).toMatchObject({ activity: { name: "Act", line: 6 } });
    });

    it("reads ValueTask, qualified, generic, nullable and array type names", () => {
      const code = classWith(
        "    [Activity]",
        "    public static ValueTask<Dictionary<string, List<int>>> Act(Models.Request? input) => default;",
      );
      expect(onlyActivity(code)).toMatchObject({
        input: "Models.Request?",
        output: "Dictionary<string, List<int>>",
        runsAs: "async",
      });
      const arrays = classWith(
        "    [Activity]",
        "    public System.Threading.Tasks.Task<string[]> Act(int[] ids) => default;",
      );
      expect(onlyActivity(arrays)).toMatchObject({
        input: "int[]",
        output: "string[]",
        runsAs: "async",
      });
    });

    it("reads a parameter with a modifier, an attribute and a default value", () => {
      const code = classWith(
        "    [Activity]",
        "    public Task<Out> Act([NotNull] in Request input = default) => Run();",
      );
      expect(onlyActivity(code)).toMatchObject({ input: "Request" });
    });
  });

  describe("runs as", () => {
    it("reports a method returning a plain type as synchronous", () => {
      const code = classWith(
        "    [Activity]",
        "    public ChargeResult ChargeCard(ChargeRequest input)",
        "    {",
        "        return new ChargeResult();",
        "    }",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "ChargeCard", line: 6 },
        input: "ChargeRequest",
        output: "ChargeResult",
        runsAs: "sync",
      });
    });

    it("reports a void method as synchronous with no output", () => {
      const code = classWith(
        "    [Activity]",
        "    public void Notify(Message input) { }",
      );
      expect(onlyActivity(code)).toMatchObject({
        input: "Message",
        output: null,
        runsAs: "sync",
      });
    });
  });

  describe("the activity's name", () => {
    it("reports the method name when the attribute gives an explicit name", () => {
      const code = classWith(
        '    [Activity("charge-card")]',
        "    public Task<ChargeResult> ChargeCardAsync(ChargeRequest input) => Run(input);",
      );
      expect(onlyActivity(code).activity).toEqual({
        name: "ChargeCardAsync",
        line: 6,
      });
    });
  });

  describe("types that can't be read", () => {
    it("reports a Task with no result and a method with no parameters as unknown", () => {
      const code = classWith(
        "    [Activity]",
        "    public async Task Ping()",
        "    {",
        "        await Task.Delay(1);",
        "    }",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "Ping", line: 6 },
        input: null,
        output: null,
        runsAs: "async",
      });
    });

    it("reports the input as unknown when the method has several parameters", () => {
      const code = classWith(
        "    [Activity]",
        "    public Task<Receipt> Act(string userId, Dictionary<string, int> amounts) => default;",
      );
      expect(onlyActivity(code)).toMatchObject({
        input: null,
        output: "Receipt",
      });
    });
  });

  describe("no activity", () => {
    it("refuses a file with Temporalio usings but no [Activity] method as no activity", () => {
      const code = lines(
        "using Temporalio.Activities;",
        "using Temporalio.Workflows;",
        "",
        "public class Activities",
        "{",
        "    public Task<Out> Act(In input) => Run(input);",
        "}",
      );
      expect(detect(code)).toEqual([]);
      expect(refusalOf(code)).toMatchObject({ type: refusalTypes.noActivity });
    });

    it("refuses an [Activity] attribute that isn't on a method as no activity", () => {
      const code = classWith(
        "    [Activity]",
        "    public string Name { get; set; }",
      );
      expect(detect(code)).toEqual([]);
      expect(refusalOf(code)).toMatchObject({ type: refusalTypes.noActivity });
    });
  });

  describe("counting activities", () => {
    it("counts two activities", () => {
      const code = classWith(
        "    [Activity]",
        "    public Task<ChargeResult> ChargeCardAsync(ChargeRequest input) => Run(input);",
        "",
        "    [Activity]",
        "    public RefundResult RefundCharge(RefundRequest input) => Run(input);",
      );
      expect(detect(code).map((facts) => facts.activity)).toEqual([
        { name: "ChargeCardAsync", line: 6 },
        { name: "RefundCharge", line: 9 },
      ]);
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });

    it("counts two [Activity] attributes stacked on one method once", () => {
      const code = classWith(
        "    [Activity]",
        "    [Activity]",
        "    public Task<Out> Act(In input) => Run(input);",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "Act", line: 7 });
    });

    it("ignores commented-out methods and attributes inside strings", () => {
      const code = classWith(
        "    // [Activity]",
        "    // public Task<Out> Old(In input) => Run(input);",
        "    /*",
        "    [Activity]",
        "    public Task<Out> Older(In input) => Run(input);",
        "    */",
        '    private const string Example = "[Activity] public Task<Out> Example(In input)";',
        '    private const string Verbatim = @"',
        "    [Activity]",
        '    public Task<Out> Verbatim(In input) => Run(input);";',
        '    private const string Raw = """',
        "        [Activity]",
        "        public Task<Out> Raw(In input) => Run(input);",
        '        """;',
        "",
        "    [Activity]",
        "    public Task<Out> Act(In input) => Run(input);",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "Act", line: 21 });
    });
  });

  describe("namespaces", () => {
    it("detects an activity under a file-scoped namespace", () => {
      const code = lines(
        "using Temporalio.Activities;",
        "",
        "namespace Payments;",
        "",
        "public class Activities",
        "{",
        "    [Activity]",
        "    public Task<Out> Act(In input) => Run(input);",
        "}",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "Act", line: 8 });
    });

    it("detects an activity and its usings inside a block-scoped namespace", () => {
      const code = lines(
        "namespace Payments",
        "{",
        "    using Stripe;",
        "    using Temporalio.Activities;",
        "",
        "    public class Activities",
        "    {",
        "        [Activity]",
        "        public Task<Out> Act(In input) => Run(input);",
        "    }",
        "}",
      );
      expect(checkCode(code, registeredSdks)).toMatchObject({
        sdk: ".NET",
        activity: { name: "Act", line: 9 },
        dependencies: [{ name: "Stripe", line: 3 }],
      });
    });
  });

  describe("configuration read", () => {
    it("finds each environment read with its line", () => {
      const code = activityWith(
        '        var a = Environment.GetEnvironmentVariable("A_TOKEN");',
        '        var b = System.Environment.GetEnvironmentVariable("B_URL", EnvironmentVariableTarget.Process);',
        '        var c = global::System.Environment.GetEnvironmentVariable(@"C_REGION");',
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "A_TOKEN", line: 8 },
        { name: "B_URL", line: 9 },
        { name: "C_REGION", line: 10 },
      ]);
    });

    it("lists a variable read twice once, at its first line, and ignores commented reads and reads in strings", () => {
      const code = activityWith(
        '        var a = Environment.GetEnvironmentVariable("TOKEN");',
        '        var b = Environment.GetEnvironmentVariable("TOKEN");',
        '        // var c = Environment.GetEnvironmentVariable("OLD");',
        '        var d = "Environment.GetEnvironmentVariable(\\"QUOTED\\")";',
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "TOKEN", line: 8 },
      ]);
    });

    it("finds an environment read inside an interpolated string", () => {
      const code = activityWith(
        '        var header = $"Bearer {Environment.GetEnvironmentVariable("SLACK_TOKEN")}";',
        "        var quote = '\"';",
        '        var later = Environment.GetEnvironmentVariable("AFTER");',
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "SLACK_TOKEN", line: 8 },
        { name: "AFTER", line: 10 },
      ]);
    });

    it("treats the text after an interpolation hole as string", () => {
      const code = activityWith(
        '        var a = $"{id}: ctx.Heartbeat() in text";',
        '        var c = $@"{id} ctx.Heartbeat() in ""verbatim"" text";',
        '        var d = $"""{id} ctx.Heartbeat() in raw text""";',
        "        ctx.Heartbeat();",
      );
      expect(onlyActivity(code).heartbeats).toEqual([{ line: 11 }]);
    });

    it("reads an interpolation's format as text, even with a quote in it", () => {
      const code = classWith(
        "    [Activity]",
        "    public Task<Out> Act(In input)",
        "    {",
        '        var label = $@"{amount:#,##0\' units} in a format";',
        "        return Run(label);",
        "    }",
        "",
        "    private void Beat() => ctx.Heartbeat();",
      );
      expect(onlyActivity(code).heartbeats).toEqual([{ line: 12 }]);
    });

    it("reports none when nothing is read", () => {
      expect(onlyActivity(activityWith()).configurationRead).toEqual([]);
    });
  });

  describe("dependencies", () => {
    it("reports none for System, Microsoft and Temporalio usings", () => {
      const code = lines(
        "using System;",
        "using System.Text.Json;",
        "global using Microsoft.Extensions.Logging;",
        "using Temporalio.Activities;",
        "using Temporalio.Exceptions;",
        "",
        "public class Activities",
        "{",
        "    [Activity]",
        "    public Task<Out> Act(In input)",
        "    {",
        "        using var client = new HttpClient();",
        "        using (var scope = Begin()) { }",
        "        return Run(input);",
        "    }",
        "}",
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });

    it("lists a third-party using, once, at its first line", () => {
      const code = lines(
        "using System;",
        "using Stripe;",
        "using Stripe.Checkout;",
        "using Temporalio.Activities;",
        "",
        "public class Activities",
        "{",
        "    [Activity]",
        "    public Task<Out> Act(In input) => Run(input);",
        "}",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "Stripe", line: 2 },
      ]);
    });

    it("resolves using static and alias forms to the namespace root, in order", () => {
      const code = lines(
        "using static Polly.Policy;",
        "using Json = Newtonsoft.Json;",
        "global using global::Amazon.S3;",
        "using Map = System.Collections.Generic.Dictionary<string, int>;",
        "using static System.Math;",
        "using Temporalio.Activities;",
        "",
        "public class Activities",
        "{",
        "    [Activity]",
        "    public Task<Out> Act(In input) => Run(input);",
        "}",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "Polly", line: 1 },
        { name: "Newtonsoft", line: 2 },
        { name: "Amazon", line: 3 },
      ]);
    });

    it("ignores usings in comments and strings", () => {
      const code = lines(
        "// using Stripe;",
        "/*",
        "using Polly;",
        "*/",
        "using Temporalio.Activities;",
        "",
        "public class Activities",
        "{",
        '    private const string Doc = @"',
        "using Newtonsoft.Json;",
        '";',
        "    [Activity]",
        "    public Task<Out> Act(In input) => Run(input);",
        "}",
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });
  });

  describe("heartbeats", () => {
    it("finds a heartbeat call with its line", () => {
      const code = activityWith(
        "        var context = ActivityExecutionContext.Current;",
        "        context",
        "            .Heartbeat(progress);",
        "        ActivityExecutionContext.Current.Heartbeat();",
      );
      expect(onlyActivity(code).heartbeats).toEqual([
        { line: 10 },
        { line: 11 },
      ]);
    });

    it("reports none when there is no heartbeat call, or only a commented one", () => {
      expect(onlyActivity(activityWith()).heartbeats).toEqual([]);
      expect(
        onlyActivity(
          activityWith(
            "        // ActivityExecutionContext.Current.Heartbeat();",
          ),
        ).heartbeats,
      ).toEqual([]);
    });
  });

  describe("non-retryable errors", () => {
    it("reports the line of nonRetryable: true, as the pasted text numbers it", () => {
      expect(onlyActivity(chargeCard).nonRetryableErrors).toEqual([
        { line: 38 },
      ]);
    });

    it("finds a one-line throw, a qualified exception and a throw expression", () => {
      const code = activityWith(
        '        throw new ApplicationFailureException("No", nonRetryable: true);',
        '        throw new Temporalio.Exceptions.ApplicationFailureException("No", nonRetryable : true);',
        '        var x = y ?? throw new ApplicationFailureException("No", nonRetryable: true);',
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([
        { line: 8 },
        { line: 9 },
        { line: 10 },
      ]);
    });

    it("finds a non-retryable throw past nested calls and brackets inside strings", () => {
      const code = activityWith(
        "        throw new ApplicationFailureException(",
        '            Format("a ) ( b", Inner(c[0])),',
        "            details: new object[] { Make(1) },",
        "            nonRetryable: true);",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([{ line: 11 }]);
    });

    it("reports none when nonRetryable: true belongs to a call nested in the arguments", () => {
      const code = activityWith(
        "        throw new ApplicationFailureException(",
        "            Describe(nonRetryable: true));",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([]);
    });

    it("reports none for retryable failures, commented throws and no throw", () => {
      const code = activityWith(
        '        throw new ApplicationFailureException("Try again", nonRetryable: false);',
        '        // throw new ApplicationFailureException("No", nonRetryable: true);',
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([]);
      expect(onlyActivity(activityWith()).nonRetryableErrors).toEqual([]);
    });
  });

  describe("pathological input", () => {
    it("reads interpolated strings nested past any real depth without failing", () => {
      const code = activityWith(`        var s = ${'$"{'.repeat(20000)};`);
      expect(() => detect(code)).not.toThrow();
    });
  });

  describe("line endings", () => {
    it("gives the same facts for CRLF input as for LF input", () => {
      const crlf = chargeCard.split("\n").join("\r\n");
      expect(checkCode(crlf, registeredSdks)).toEqual(
        checkCode(chargeCard, registeredSdks),
      );
    });
  });

  describe("SDK selection", () => {
    it("recognises the SDK from the attribute alone", () => {
      const code = lines(
        "public class Activities",
        "{",
        "    [Activity]",
        "    public Task<Out> Act(In input) => Run(input);",
        "}",
      );
      expect(checkCode(code, registeredSdks)).toMatchObject({ sdk: ".NET" });
    });

    it("leaves Python files to the Python detector", () => {
      const code = lines(
        "from temporalio import activity",
        "",
        "@activity.defn",
        "async def act(items: list[Item]) -> Out:",
        "    ...",
      );
      expect(checkCode(code, registeredSdks)).toMatchObject({ sdk: "Python" });
    });
  });
});
