import { describe, expect, it } from "vitest";
import { registeredSdks, sdkRegistry } from "../sdks/registry";
import type { ActivityFacts } from "./facts";
import { identifySdk } from "./identify";
import type { Pattern } from "./pattern";
import { checkCode } from "./pipeline";
import { CheckRefusal, refusalTypes } from "./refusals";
import { MAX_CODE_BYTES } from "./size-limit";
import {
  rubyActivityClass,
  rubyBeforeMethod,
  rubyBlockComment,
  rubyDetector,
  rubyEnvironmentRead,
  rubyExecuteMethod,
  rubyFiberExecutor,
  rubyHeartbeatCall,
  rubyHeredocStart,
  rubyNonRetryableArgument,
  rubyNonRetryableRaise,
  rubyPatterns,
  rubyRequire,
  rubySdkRequire,
  rubySigParameter,
  rubySigParams,
  rubySigReturns,
  rubySorbetSig,
  rubyTypeName,
} from "./ruby-detector";
import { isRubyStandardLibrary, rubyStandardLibrary } from "./ruby-stdlib";
import { toSource } from "./source";
import { unacceptedSdks } from "./unaccepted-sdks";

const detect = (code: string) =>
  rubyDetector.detect(toSource(code), sdkRegistry.Ruby.isStandardLibrary);

const lines = (...code: string[]) => code.join("\n");

/** The Problem Details body of the refusal the pipeline throws for the code. */
const refusalOf = (code: string, declared?: "Ruby") => {
  try {
    checkCode(code, registeredSdks, declared);
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

/** A minimal activity with the given lines in its execute method, which start on line 5. */
const activityWith = (...body: string[]) =>
  lines(
    'require "temporalio/activity"',
    "",
    "class Act < Temporalio::Activity::Definition",
    "    def execute(input)",
    ...body,
    "    end",
    "end",
  );

/** A representative Ruby activity that carries all eight facts. */
const chargeCard = lines(
  'require "json"',
  'require "net/http"',
  'require "stripe"',
  'require "sorbet-runtime"',
  'require "temporalio/activity"',
  "",
  'Stripe.api_key = ENV["STRIPE_API_KEY"]',
  "",
  "class ChargeCard < Temporalio::Activity::Definition",
  "    extend T::Sig",
  "",
  "    sig { params(input: ChargeRequest).returns(ChargeResult) }",
  "    def execute(input)",
  "        Temporalio::Activity::Context.current.heartbeat(input.request_id)",
  '        timeout = ENV.fetch("CHARGE_TIMEOUT", "30")',
  "        if input.amount_cents <= 0",
  "            raise Temporalio::Error::ApplicationError.new(",
  '                "Amount must be positive",',
  '                type: "InvalidAmount",',
  "                non_retryable: true",
  "            )",
  "        end",
  '        ChargeResult.new(charge_id: "ch_1", timeout: timeout)',
  "    end",
  "end",
);

describe("rubyDetector", () => {
  describe("the patterns", () => {
    it("are named, unique, documented and stateless", () => {
      const names = rubyPatterns.map((pattern) => pattern.name);
      expect(new Set(names).size).toBe(names.length);
      for (const pattern of rubyPatterns) {
        expect(pattern.name).toMatch(/^ruby(?:-[a-z]+)+$/);
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
      }
    });

    it("are registered with the pipeline", () => {
      expect(sdkRegistry.Ruby.detector).toBe(rubyDetector);
      expect(sdkRegistry.Ruby.recognition.sdkMarkers).toEqual([
        rubySdkRequire,
        rubyActivityClass,
      ]);
      expect(sdkRegistry.Ruby.recognition.activityMarkers).toEqual([
        rubyActivityClass,
      ]);
      expect(sdkRegistry.Ruby.recognition.shapeMarkers).toEqual([]);
    });

    const cases: readonly (readonly [Pattern, string, string])[] = [
      [rubySdkRequire, 'require "temporalio/activity"', 'require "temporal"'],
      [
        rubyActivityClass,
        "class ChargeCard < Temporalio::Activity::Definition",
        "class ChargeCard < Temporalio::Workflow::Definition",
      ],
      [rubyExecuteMethod, "    def execute(input)", "    def executed(input)"],
      [
        rubySorbetSig,
        "  sig { params(input: In).returns(Out) }",
        "  signature { params(input: In) }",
      ],
      [
        rubyBeforeMethod,
        "\n    # Charges the card.\n    ",
        "\n    x = 1\n    ",
      ],
      [rubySigParams, "params(input: In)", "parameters(input: In)"],
      [rubySigParameter, "input: ChargeRequest", "ChargeRequest"],
      [rubySigReturns, "returns(ChargeResult)", "return(ChargeResult)"],
      [rubyTypeName, "T::Array[Billing::Charge]", "T.any(A, B)"],
      [
        rubyFiberExecutor,
        "  activity_executor :fiber",
        "  activity_executor :default",
      ],
      [
        rubyNonRetryableRaise,
        "raise Temporalio::Error::ApplicationError.new(",
        "raise Temporalio::Error::ApplicationError, 'x'",
      ],
      [rubyNonRetryableArgument, "non_retryable: true", "non_retryable: false"],
      [rubyEnvironmentRead, 'ENV["API_KEY"]', 'MY_ENV["API_KEY"]'],
      [rubyRequire, 'require "stripe"', 'require_relative "stripe"'],
      [
        rubyHeartbeatCall,
        "Temporalio::Activity::Context.current.heartbeat",
        "context.heartbeat_details",
      ],
      [rubyBlockComment, "=begin\nold code\n=end", " =begin\nold code\n =end"],
      [rubyHeredocStart, "<<~SQL", "<< sql"],
    ];

    it("has a case and a near miss for every pattern", () => {
      expect(cases.map(([pattern]) => pattern.name).sort()).toEqual(
        rubyPatterns.map(({ name }) => name).sort(),
      );
    });

    it.each(
      cases.map(
        ([pattern, hit, miss]) => [pattern.name, hit, miss, pattern] as const,
      ),
    )("%s matches %j and misses %j", (_name, hit, miss, pattern) => {
      expect(pattern.regex.test(hit)).toBe(true);
      expect(pattern.regex.test(miss)).toBe(false);
    });
  });

  describe("an activity class carrying every fact", () => {
    it("detects all eight facts", () => {
      expect(checkCode(chargeCard, registeredSdks)).toEqual({
        sdk: "Ruby",
        activity: { name: "ChargeCard", line: 9 },
        input: "ChargeRequest",
        output: "ChargeResult",
        runsAs: "sync",
        nonRetryableErrors: [{ line: 20 }],
        configurationRead: [
          { name: "STRIPE_API_KEY", line: 7 },
          { name: "CHARGE_TIMEOUT", line: 15 },
        ],
        dependencies: [
          { name: "stripe", line: 3 },
          { name: "sorbet-runtime", line: 4 },
        ],
        heartbeats: [{ line: 14 }],
        provenance: {
          sdk: "detected",
          activity: "detected",
          inputOutput: "detected",
          runsAs: "detected",
          nonRetryableErrors: "detected",
          configurationRead: "detected",
          dependencies: "detected",
          heartbeats: "detected",
        },
      });
    });

    it("gives the same facts for CRLF input as for LF input", () => {
      expect(
        checkCode(chargeCard.replaceAll("\n", "\r\n"), registeredSdks),
      ).toEqual(checkCode(chargeCard, registeredSdks));
    });
  });

  describe("the activity", () => {
    it("names it by its class, at the class's line, with a namespace or leading ::", () => {
      expect(
        onlyActivity(
          lines(
            "module Billing",
            "  class Billing::ChargeCard < ::Temporalio::Activity::Definition",
            "    def execute = nil",
            "  end",
            "end",
          ),
        ).activity,
      ).toEqual({ name: "Billing::ChargeCard", line: 2 });
    });

    it("is identified from the activity class alone, with no require", () => {
      expect(
        checkCode(
          lines(
            "class Act < Temporalio::Activity::Definition",
            "  def execute(input)",
            "    input",
            "  end",
            "end",
          ),
          registeredSdks,
        ),
      ).toMatchObject({ sdk: "Ruby", activity: { name: "Act", line: 1 } });
    });
  });

  describe("input and output", () => {
    it("leaves both blank with no Sorbet signature", () => {
      const activity = onlyActivity(activityWith("        input"));
      expect(activity.input).toBeNull();
      expect(activity.output).toBeNull();
    });

    it("reads a signature in a do block, with comments before the method", () => {
      const activity = onlyActivity(
        lines(
          "class Act < Temporalio::Activity::Definition",
          "  sig do",
          "    params(request: Billing::ChargeRequest)",
          "      .returns(T.nilable(ChargeResult))",
          "  end",
          "  # Charges the card.",
          "",
          "  def execute(request)",
          "  end",
          "end",
        ),
      );
      expect(activity.input).toBe("Billing::ChargeRequest");
      expect(activity.output).toBe("T.nilable(ChargeResult)");
    });

    it("leaves the output blank for a void signature, and the input blank for two parameters", () => {
      const activity = onlyActivity(
        lines(
          "class Act < Temporalio::Activity::Definition",
          "  sig { params(a: String, b: Integer).void }",
          "  def execute(a, b)",
          "  end",
          "end",
        ),
      );
      expect(activity.input).toBeNull();
      expect(activity.output).toBeNull();
    });

    it("ignores a signature that belongs to another method", () => {
      const activity = onlyActivity(
        lines(
          "class Act < Temporalio::Activity::Definition",
          "  sig { params(x: In).returns(Out) }",
          "  def helper(x) = x",
          "",
          "  def execute(input)",
          "  end",
          "end",
        ),
      );
      expect(activity.input).toBeNull();
      expect(activity.output).toBeNull();
    });

    it("shows a type it can't read as unknown", () => {
      const activity = onlyActivity(
        lines(
          "class Act < Temporalio::Activity::Definition",
          "  sig { params(x: T.any(A, B)).returns(T.untyped) }",
          "  def execute(x)",
          "  end",
          "end",
        ),
      );
      expect(activity.input).toBeNull();
      expect(activity.output).toBeNull();
    });
  });

  describe("runs as", () => {
    it("reads an activity on the default executor as synchronous", () => {
      expect(onlyActivity(activityWith("        input")).runsAs).toBe("sync");
      expect(
        onlyActivity(
          lines(
            "class Act < Temporalio::Activity::Definition",
            "  activity_executor :default",
            "  def execute = nil",
            "end",
          ),
        ).runsAs,
      ).toBe("sync");
    });

    it("leaves Runs as blank for an activity on the fiber executor", () => {
      expect(
        onlyActivity(
          lines(
            "class Act < Temporalio::Activity::Definition",
            "  activity_executor :fiber",
            "  def execute = nil",
            "end",
          ),
        ).runsAs,
      ).toBeNull();
    });
  });

  describe("no activity", () => {
    it("refuses a file that requires the SDK but declares no activity class as no activity", () => {
      const code = lines(
        'require "temporalio/client"',
        "",
        'client = Temporalio::Client.connect("localhost:7233", "default")',
      );
      expect(detect(code)).toEqual([]);
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.noActivity,
        sdk: "Ruby",
      });
    });

    it("asks for the SDK to be chosen for plain Ruby with no Temporal marker", () => {
      const code = lines("class Greeter", "  def greet(name) = name", "end");
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.sdkChoiceNeeded,
      });
    });

    it("refuses plain Ruby declared as Ruby as no activity", () => {
      const code = lines("class Greeter", "  def greet(name) = name", "end");
      expect(refusalOf(code, "Ruby")).toMatchObject({
        type: refusalTypes.noActivity,
        sdk: "Ruby",
      });
    });

    it("ignores an activity class in a comment, a block comment, a string or a heredoc", () => {
      const code = lines(
        'require "temporalio/activity"',
        "# class A < Temporalio::Activity::Definition",
        "=begin",
        "class B < Temporalio::Activity::Definition",
        "=end",
        'EXAMPLE = "',
        "class C < Temporalio::Activity::Definition",
        '"',
        "DOC = <<~RUBY",
        "  class D < Temporalio::Activity::Definition",
        "RUBY",
      );
      expect(detect(code)).toEqual([]);
    });
  });

  describe("counting activities", () => {
    const two = lines(
      'require "temporalio/activity"',
      "class A < Temporalio::Activity::Definition",
      "  def execute = nil",
      "end",
      "class B < Temporalio::Activity::Definition",
      "  def execute = nil",
      "end",
    );

    it("detects each activity class in a file", () => {
      expect(detect(two).map(({ activity }) => activity)).toEqual([
        { name: "A", line: 2 },
        { name: "B", line: 5 },
      ]);
    });

    it("refuses a file with several activities", () => {
      expect(refusalOf(two)).toMatchObject({
        type: refusalTypes.multipleActivities,
      });
    });

    it("refuses a file with several activities when Ruby is declared", () => {
      expect(refusalOf(two, "Ruby")).toMatchObject({
        type: refusalTypes.multipleActivities,
      });
    });

    it("reads each class's own signature and executor", () => {
      const found = detect(
        lines(
          "class A < Temporalio::Activity::Definition",
          "  activity_executor :fiber",
          "  sig { params(x: AIn).returns(AOut) }",
          "  def execute(x) = x",
          "end",
          "class B < Temporalio::Activity::Definition",
          "  def execute(y) = y",
          "end",
        ),
      );
      expect(
        found.map(({ input, output, runsAs }) => ({ input, output, runsAs })),
      ).toEqual([
        { input: "AIn", output: "AOut", runsAs: null },
        { input: null, output: null, runsAs: "sync" },
      ]);
    });
  });

  describe("non-retryable errors", () => {
    it("reports the line of non_retryable: true in a raised application error", () => {
      expect(detect(chargeCard)[0]?.nonRetryableErrors).toEqual([{ line: 20 }]);
    });

    it("finds a one-line raise, fail, a short class name and a hash-rocket argument", () => {
      const found = onlyActivity(
        activityWith(
          '        raise Temporalio::Error::ApplicationError.new("a", non_retryable: true)',
          '        fail ApplicationError.new("b", non_retryable: true)',
          '        raise Error::ApplicationError.new("c", :non_retryable => true)',
        ),
      );
      expect(found.nonRetryableErrors).toEqual([
        { line: 5 },
        { line: 6 },
        { line: 7 },
      ]);
    });

    it("finds the argument past nested calls and brackets inside strings", () => {
      const found = onlyActivity(
        activityWith(
          "        raise Temporalio::Error::ApplicationError.new(",
          '            format("bad )(%s", detail(input, [1, 2])),',
          "            non_retryable: true",
          "        )",
        ),
      );
      expect(found.nonRetryableErrors).toEqual([{ line: 7 }]);
    });

    it("reports none for a retryable error, a nested non_retryable, a comment and a plain raise", () => {
      const found = onlyActivity(
        activityWith(
          '        raise Temporalio::Error::ApplicationError.new("a", non_retryable: false)',
          '        raise Temporalio::Error::ApplicationError.new("b", details(non_retryable: true))',
          '        # raise Temporalio::Error::ApplicationError.new("c", non_retryable: true)',
          '        raise ArgumentError, "d"',
        ),
      );
      expect(found.nonRetryableErrors).toEqual([]);
    });
  });

  describe("configuration read", () => {
    it("finds each form of environment read with its line", () => {
      const found = onlyActivity(
        activityWith(
          '        a = ENV["A_KEY"]',
          "        b = ENV['B_KEY']",
          '        c = ENV.fetch("C_KEY")',
          '        d = ENV.fetch "D_KEY", "default"',
          '        e = ::ENV["E_KEY"]',
          '        f = "Bearer #{ENV["F_KEY"]}"',
        ),
      );
      expect(found.configurationRead).toEqual([
        { name: "A_KEY", line: 5 },
        { name: "B_KEY", line: 6 },
        { name: "C_KEY", line: 7 },
        { name: "D_KEY", line: 8 },
        { name: "E_KEY", line: 9 },
        { name: "F_KEY", line: 10 },
      ]);
    });

    it("lists a variable read twice once, and ignores comments, strings and lookalikes", () => {
      const found = onlyActivity(
        activityWith(
          '        a = ENV["A_KEY"]',
          '        b = ENV.fetch("A_KEY")',
          '        # ENV["COMMENTED"]',
          "        s = 'ENV[\"IN_STRING\"]'",
          '        t = MY_ENV["LOOKALIKE"]',
        ),
      );
      expect(found.configurationRead).toEqual([{ name: "A_KEY", line: 5 }]);
    });
  });

  describe("dependencies", () => {
    it("leaves out standard-library requires, the SDK, require_relative and local paths", () => {
      const found = onlyActivity(
        lines(
          'require "json"',
          'require "net/http"',
          "require 'securerandom'",
          'require "temporalio/activity"',
          'require_relative "models"',
          'require "./lib/helpers"',
          "",
          "class Act < Temporalio::Activity::Definition",
          "  def execute = nil",
          "end",
        ),
      );
      expect(found.dependencies).toEqual([]);
    });

    it("lists each gem once, at its first require, in order, with path forms kept as required", () => {
      const found = onlyActivity(
        lines(
          'require("aws-sdk-s3")',
          "require 'pg'",
          'require "google/cloud/storage"',
          'require "pg"',
          '# require "commented"',
          'NOTE = "require \\"in_string\\""',
          "",
          "class Act < Temporalio::Activity::Definition",
          "  def execute = nil",
          "end",
        ),
      );
      expect(found.dependencies).toEqual([
        { name: "aws-sdk-s3", line: 1 },
        { name: "pg", line: 2 },
        { name: "google/cloud/storage", line: 3 },
      ]);
    });

    it("reads a require after a semicolon", () => {
      const found = onlyActivity(
        lines(
          'require "json"; require "stripe"',
          "class Act < Temporalio::Activity::Definition",
          "  def execute = nil",
          "end",
        ),
      );
      expect(found.dependencies).toEqual([{ name: "stripe", line: 1 }]);
    });
  });

  describe("heartbeats", () => {
    it("finds each form of heartbeat call with its line", () => {
      const found = onlyActivity(
        activityWith(
          "        Temporalio::Activity::Context.current.heartbeat",
          "        context = Temporalio::Activity::Context.current",
          "        context.heartbeat(progress)",
          "        context",
          "            .heartbeat 50",
        ),
      );
      expect(found.heartbeats).toEqual([{ line: 5 }, { line: 7 }, { line: 9 }]);
    });

    it("reports none for heartbeat details, a comment, a string or no call", () => {
      const found = onlyActivity(
        activityWith(
          "        details = context.heartbeat_details",
          "        # context.heartbeat",
          '        puts "context.heartbeat"',
        ),
      );
      expect(found.heartbeats).toEqual([]);
    });
  });

  describe("reading Ruby's comments and strings", () => {
    it("reads code after a heredoc, a regular expression and a percent literal", () => {
      const found = onlyActivity(
        activityWith(
          '        sql = <<~SQL, ENV["AFTER_OPENER"]',
          "          SELECT ENV['IN_HEREDOC']",
          "        SQL",
          "        ok = input =~ /[\"'#]/",
          "        words = %w[ENV['IN_WORDS'] two]",
          '        key = ENV["AFTER_ALL"]',
        ),
      );
      expect(found.configurationRead).toEqual([
        { name: "AFTER_OPENER", line: 5 },
        { name: "AFTER_ALL", line: 10 },
      ]);
    });

    it("reads division as division, so the code after it is read", () => {
      const found = onlyActivity(
        activityWith(
          "        half = total / 2",
          '        key = ENV["KEY"] / 1',
        ),
      );
      expect(found.configurationRead).toEqual([{ name: "KEY", line: 6 }]);
    });
  });
});

describe("Ruby detection at the size limit", () => {
  const atLimit = (prefix: string, unit: string) =>
    prefix +
    unit.repeat(Math.floor((MAX_CODE_BYTES - prefix.length) / unit.length));
  const sdk = 'require "temporalio/activity"\n';
  const adversarial: [string, string][] = [
    [
      "activity classes with signatures and execute methods",
      atLimit(
        sdk,
        "class A < Temporalio::Activity::Definition\n  sig { params(x: X).returns(Y) }\n  def execute(x) = x\nend\n",
      ),
    ],
    ["unclosed strings", atLimit(sdk, '"#{ENV["A"]\n')],
    ["unclosed heredocs", atLimit(sdk, "x = <<~SQL\n")],
    ["nested interpolation", atLimit(sdk, '"#{"#{"#{')],
    ["unclosed sig blocks", atLimit(sdk, "sig do\n")],
    [
      "non-retryable raises",
      atLimit(sdk, "raise ApplicationError.new(non_retryable: true\n"),
    ],
  ];

  it.each(adversarial)("detects %s in under 250 ms", (_, code) => {
    const started = performance.now();
    detect(code);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("the Ruby standard library", () => {
  it.each([
    "json",
    "net/http",
    "set",
    "securerandom",
    "open-uri",
    "csv",
    "English",
  ])("includes %s", (name) => {
    expect(isRubyStandardLibrary(name)).toBe(true);
  });

  it.each([
    "stripe",
    "aws-sdk-s3",
    "pg",
    "slack-ruby-client",
    "temporalio",
    "json-schema",
  ])("leaves out %s", (name) => {
    expect(isRubyStandardLibrary(name)).toBe(false);
  });

  it("keeps the SDK off the list", () => {
    expect(rubyStandardLibrary.has("temporalio")).toBe(false);
  });
});

describe("identifying Ruby among the other SDKs", () => {
  const everySdk = [...registeredSdks, ...unacceptedSdks];
  const identify = (code: string) => identifySdk(toSource(code).text, everySdk);

  it("identifies a Ruby activity as Ruby, detected", () => {
    expect(identify(chargeCard)).toEqual({
      outcome: "identified",
      sdk: "Ruby",
      tier: "detected",
      matchedPatterns: ["ruby-sdk-require", "ruby-activity-class"],
    });
  });

  it.each([
    [
      "Python",
      lines(
        "from temporalio import activity",
        "@activity.defn",
        "async def greet(name: str) -> str:",
        "    return name",
      ),
    ],
    [
      "TypeScript",
      lines(
        'import { heartbeat } from "@temporalio/activity";',
        "export async function greet(name: string): Promise<string> {",
        "  return name;",
        "}",
      ),
    ],
    [
      ".NET",
      lines(
        "using Temporalio.Activities;",
        "public class Greetings",
        "{",
        "    [Activity]",
        "    public string Greet(string name) => name;",
        "}",
      ),
    ],
    [
      "Java",
      lines(
        "import io.temporal.activity.ActivityInterface;",
        "@ActivityInterface",
        "public interface Greeter { String greet(String name); }",
      ),
    ],
    [
      "Go",
      lines(
        'import "go.temporal.io/sdk/activity"',
        "func Greet(ctx context.Context, name string) (string, error) {",
        "    return name, nil",
        "}",
      ),
    ],
    [
      "PHP",
      lines(
        "use Temporal\\Activity\\ActivityInterface;",
        "#[ActivityInterface]",
        "interface Greeter { public function greet(string $name): string; }",
      ),
    ],
  ])("identifies a %s activity as its own SDK, never as Ruby", (sdk, code) => {
    expect(identify(code)).toMatchObject({ outcome: "identified", sdk });
  });

  it("is not identified as another SDK by the Ruby detector's patterns", () => {
    for (const { sdk, recognition } of everySdk) {
      if (sdk === "Ruby") {
        continue;
      }
      for (const marker of [
        ...recognition.sdkMarkers,
        ...recognition.activityMarkers,
        ...recognition.shapeMarkers,
      ]) {
        expect(marker.regex.test(chargeCard)).toBe(false);
      }
    }
  });
});
