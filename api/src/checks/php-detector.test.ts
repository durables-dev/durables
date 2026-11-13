import { describe, expect, it } from "vitest";
import { registeredSdks, sdkRegistry } from "../sdks/registry";
import type { ActivityFacts } from "./facts";
import { identifySdk } from "./identify";
import { integrationsFor } from "./integrations";
import type { Pattern } from "./pattern";
import { isPhpBuiltin } from "./php-builtins";
import {
  phpActivityAttribute,
  phpActivityInterfaceAttribute,
  phpActivityType,
  phpBeforeType,
  phpDetector,
  phpEnvironmentRead,
  phpHeartbeatCall,
  phpHeredocStart,
  phpImportedName,
  phpMethod,
  phpNamespaceBlock,
  phpNamespaceDeclaration,
  phpNonRetryableArgument,
  phpNonRetryableThrow,
  phpParameter,
  phpPatterns,
  phpReturnType,
  phpSdkUse,
  phpTrueArgument,
  phpTypeName,
  phpUseStatement,
} from "./php-detector";
import { checkCode } from "./pipeline";
import { CheckRefusal, refusalTypes } from "./refusals";
import { toSource } from "./source";
import { unacceptedSdks } from "./unaccepted-sdks";

const detect = (code: string) =>
  phpDetector.detect(toSource(code), sdkRegistry.PHP.isStandardLibrary);

const lines = (...code: string[]) => code.join("\n");

/** The Problem Details body of the refusal the pipeline throws for the code. */
const refusalOf = (code: string, declared?: "PHP") => {
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

/** A minimal activity class with the given method body lines, which start on line 9. */
const activityWith = (...body: string[]) =>
  lines(
    "<?php",
    "",
    "use Temporal\\Activity\\ActivityInterface;",
    "",
    "#[ActivityInterface]",
    "class Payments",
    "{",
    "    public function charge(ChargeRequest $request): ChargeResult",
    "    {",
    ...body,
    "    }",
    "}",
  );

// The activity is declared on an interface, as Temporal's PHP activity basics page shows,
// and implemented by a class in the same file.
const chargeCardOnInterface = lines(
  "<?php", // 1
  "",
  "declare(strict_types=1);",
  "",
  "namespace App\\Billing;", // 5
  "",
  "use App\\Models\\ChargeRequest;",
  "use Aws\\S3\\S3Client;",
  "use DateTimeImmutable;",
  "use JoliCode\\Slack\\ClientFactory;", // 10
  "use Stripe\\Exception\\CardException;",
  "use Stripe\\StripeClient;",
  "use Temporal\\Activity;",
  "use Temporal\\Activity\\ActivityInterface;",
  "use Temporal\\Activity\\ActivityMethod;", // 15
  "use Temporal\\Exception\\Failure\\ApplicationFailure;",
  "",
  '#[ActivityInterface(prefix: "Billing.")]',
  "interface PaymentsActivity",
  "{", // 20
  '    #[ActivityMethod(name: "ChargeCard")]',
  "    public function chargeCard(ChargeRequest $request): ChargeResult;",
  "}",
  "",
  "class Payments implements PaymentsActivity", // 25
  "{",
  "    public function chargeCard(ChargeRequest $request): ChargeResult",
  "    {",
  "        $stripe = new StripeClient(getenv('STRIPE_API_KEY'));",
  '        $bucket = $_ENV["RECEIPTS_BUCKET"];', // 30
  "        Activity::heartbeat('charging');",
  "        try {",
  "            $charge = $stripe->charges->create($request->toArray());",
  "        } catch (CardException $e) {",
  "            throw new ApplicationFailure($e->getMessage(), 'CardDeclined', true);", // 35
  "        }",
  "        return new ChargeResult($charge->id, new DateTimeImmutable());",
  "    }",
  "}",
);

// The activity is declared on the class itself, as Temporal's PHP setup page shows.
const greetOnClass = lines(
  "<?php",
  "declare(strict_types=1);",
  "",
  "namespace App;",
  "",
  "use Temporal\\Activity\\ActivityInterface;",
  "use Temporal\\Activity\\ActivityMethod;",
  "",
  "#[ActivityInterface]",
  "class GreetingActivity",
  "{",
  "    #[ActivityMethod]",
  "    public function greet(string $name): string",
  "    {",
  '        return "Hello, $name!";',
  "    }",
  "}",
);

const javaActivity = lines(
  "package io.example;",
  "",
  "import io.temporal.activity.ActivityInterface;",
  "import io.temporal.activity.ActivityMethod;",
  "",
  "@ActivityInterface",
  "public interface Greeter {",
  "    @ActivityMethod",
  "    String greet(String name);",
  "}",
);

describe("the PHP patterns", () => {
  it("are named, unique, documented and stateless", () => {
    const names = phpPatterns.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    for (const pattern of phpPatterns) {
      expect(pattern.name).toMatch(/^php(?:-[a-z]+)+$/);
      expect(pattern.description.length).toBeGreaterThan(0);
      expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
    }
  });

  it("recognise the activity attribute and its docblock annotation, moved from the unaccepted markers", () => {
    expect(
      phpActivityAttribute.regex.test(
        "#[ActivityInterface]\ninterface Greeter",
      ),
    ).toBe(true);
    expect(phpActivityAttribute.regex.test(" * @ActivityMethod")).toBe(true);
  });

  it("keep the existing marker names", () => {
    expect(phpSdkUse.name).toBe("php-sdk-use");
    expect(phpActivityAttribute.name).toBe("php-activity-attribute");
  });

  const cases: readonly (readonly [Pattern, string, string])[] = [
    [
      phpSdkUse,
      "use Temporal\\Activity\\ActivityInterface;",
      "use App\\Temporal\\Thing;",
    ],
    [phpActivityAttribute, "#[ActivityInterface]", "#[ActivityOptions]"],
    [
      phpActivityInterfaceAttribute,
      '#[ActivityInterface(prefix: "Billing.")]',
      "#[ActivityMethod]",
    ],
    [phpBeforeType, "// note\n#[Deprecated]\n", "x"],
    [
      phpActivityType,
      "final class Payments implements Billing {",
      "enum Status {",
    ],
    [
      phpMethod,
      "public function chargeCard(",
      "$handler = function ($request) {",
    ],
    [phpParameter, "ChargeRequest $request", "ChargeRequest request"],
    [phpTypeName, "?App\\Models\\ChargeRequest", "array{id: int}"],
    [phpReturnType, ": ChargeResult", " ChargeResult"],
    [
      phpNonRetryableThrow,
      "throw new ApplicationFailure(",
      "$failure = new ApplicationFailure(",
    ],
    [phpNonRetryableArgument, "nonRetryable: true", "nonRetryable: false"],
    [phpTrueArgument, "true", "'true'"],
    [phpEnvironmentRead, "getenv('STRIPE_API_KEY')", "getenv($name)"],
    [phpUseStatement, "use Stripe\\StripeClient;", "function () use ($x) {"],
    [phpImportedName, "Stripe\\StripeClient as Client", "Stripe StripeClient"],
    [phpNamespaceDeclaration, "namespace App\\Billing;", "// namespace App;"],
    [phpHeartbeatCall, "::heartbeat($progress)", "->heartbeatCount("],
    [phpHeredocStart, "<<<'SQL'\n", "<<SQL\n"],
    [phpNamespaceBlock, "namespace App\\Billing ", "namespace App\\Billing;"],
  ];

  it("covers every pattern with a case and a near miss", () => {
    expect(new Set(cases.map(([pattern]) => pattern.name))).toEqual(
      new Set(phpPatterns.map(({ name }) => name)),
    );
  });

  it.each(
    cases.map(([pattern, hit, miss]) => [pattern.name, pattern, hit, miss]),
  )(
    "%s matches its case and misses a near miss",
    (_name, pattern, hit, miss) => {
      const anchored = new RegExp(
        `^(?:${pattern.regex.source})`,
        pattern.regex.flags,
      );
      expect(anchored.test(hit)).toBe(true);
      if (pattern === phpBeforeType) {
        // It always matches, possibly nothing: a near miss reads as nothing.
        expect(anchored.exec(miss)?.[0]).toBe("");
      } else {
        expect(anchored.test(miss)).toBe(false);
      }
    },
  );
});

describe("phpDetector", () => {
  describe("the eight facts from a representative activity", () => {
    const facts = () => checkCode(chargeCardOnInterface, registeredSdks);

    it("identifies the SDK as PHP, detected", () => {
      expect(facts().sdk).toBe("PHP");
      expect(facts().provenance.sdk).toBe("detected");
    });

    it("finds the activity on the interface, with its line", () => {
      expect(facts().activity).toEqual({ name: "chargeCard", line: 22 });
    });

    it("reads the input and output types", () => {
      expect(facts().input).toBe("ChargeRequest");
      expect(facts().output).toBe("ChargeResult");
    });

    it("reads it as running synchronously", () => {
      expect(facts().runsAs).toBe("sync");
    });

    it("finds the non-retryable application failure", () => {
      expect(facts().nonRetryableErrors).toEqual([{ line: 35 }]);
    });

    it("finds each environment variable read", () => {
      expect(facts().configurationRead).toEqual([
        { name: "STRIPE_API_KEY", line: 29 },
        { name: "RECEIPTS_BUCKET", line: 30 },
      ]);
    });

    it("lists third-party namespaces, leaving out PHP's own, the SDK's and the file's own", () => {
      expect(facts().dependencies).toEqual([
        { name: "Aws\\S3", line: 8 },
        { name: "JoliCode\\Slack", line: 10 },
        { name: "Stripe", line: 12 },
      ]);
    });

    it("finds the heartbeat", () => {
      expect(facts().heartbeats).toEqual([{ line: 31 }]);
    });
  });

  describe("#[ActivityInterface] on an interface and on a class", () => {
    it("accepts the attribute on an interface", () => {
      const found = checkCode(chargeCardOnInterface, registeredSdks);
      expect(found).toMatchObject({
        sdk: "PHP",
        activity: { name: "chargeCard" },
      });
    });

    it("accepts the attribute on a class, the same way", () => {
      expect(checkCode(greetOnClass, registeredSdks)).toMatchObject({
        sdk: "PHP",
        activity: { name: "greet", line: 13 },
        input: "string",
        output: "string",
        runsAs: "sync",
        provenance: { sdk: "detected" },
      });
    });

    it("reads the attribute with its namespace, among other attributes, and with modifiers", () => {
      const code = lines(
        "<?php",
        "use Temporal\\Activity\\ActivityInterface;",
        "#[Deprecated, \\Temporal\\Activity\\ActivityInterface]",
        "// Billing activities.",
        "#[Internal]",
        "final readonly class Payments",
        "{",
        "    function refund(RefundRequest $request): void {}",
        "}",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "refund", line: 8 },
        input: "RefundRequest",
        output: null,
      });
    });

    it("counts only public, non-static methods that aren't magic", () => {
      const code = lines(
        "<?php",
        "#[ActivityInterface]",
        "class Payments",
        "{",
        "    public function __construct(private StripeClient $stripe) {}",
        "    private function sign(string $payload): string { return $payload; }",
        "    protected function audit(): void {}",
        "    public static function create(): self { return new self(); }",
        "    public function charge(ChargeRequest $request): ChargeResult",
        "    {",
        "        $format = function (string $x): string { return $x; };",
        "        return new ChargeResult();",
        "    }",
        "}",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "charge", line: 9 });
    });

    it("reads only the attributed type, not a class that implements it", () => {
      expect(detect(chargeCardOnInterface)).toHaveLength(1);
    });

    it("ignores the attribute in a comment, a string or a heredoc", () => {
      const code = lines(
        "<?php",
        "// #[ActivityInterface]",
        "# class Commented {",
        "$example = '",
        "#[ActivityInterface]",
        "class InString { public function a() {} }",
        "';",
        "$doc = <<<EOT",
        "#[ActivityInterface]",
        "class InHeredoc { public function b() {} }",
        "EOT;",
        "class Plain { public function c() {} }",
      );
      expect(detect(code)).toEqual([]);
    });
  });

  describe("facts detection can't read", () => {
    it("leaves the input blank for an untyped, variadic or second parameter", () => {
      for (const parameters of [
        "$request",
        "Item ...$items",
        "A $a, B $b",
        "",
      ]) {
        const code = lines(
          "<?php",
          "#[ActivityInterface]",
          "interface Payments",
          "{",
          `    public function charge(${parameters}): Receipt;`,
          "}",
        );
        expect(onlyActivity(code).input).toBeNull();
      }
    });

    it("leaves the output blank with no return type, or one that returns nothing", () => {
      for (const returns of ["", ": void", ": never", ": null"]) {
        const code = lines(
          "<?php",
          "#[ActivityInterface]",
          "interface Payments",
          "{",
          `    public function charge(Request $r)${returns};`,
          "}",
        );
        expect(onlyActivity(code).output).toBeNull();
      }
    });

    it("reads a nullable, namespaced or union type as written", () => {
      const code = lines(
        "<?php",
        "#[ActivityInterface]",
        "interface Payments",
        "{",
        "    public function charge(?\\App\\ChargeRequest $r = null): int|string;",
        "}",
      );
      expect(onlyActivity(code)).toMatchObject({
        input: "?\\App\\ChargeRequest",
        output: "int|string",
      });
    });

    it("still accepts the activity when only the activity can be read", () => {
      const code = lines(
        "<?php",
        "use Temporal\\Activity\\ActivityInterface;",
        "#[ActivityInterface]",
        "interface Payments { public function charge($request); }",
      );
      expect(checkCode(code, registeredSdks)).toMatchObject({
        sdk: "PHP",
        activity: { name: "charge", line: 4 },
        input: null,
        output: null,
        nonRetryableErrors: [],
        configurationRead: [],
        dependencies: [],
        heartbeats: [],
      });
    });
  });

  describe("non-retryable errors", () => {
    it.each([
      [
        "true as the third argument",
        "throw new ApplicationFailure('m', 'T', true);",
      ],
      [
        "TRUE as the third argument",
        "throw new ApplicationFailure('m', 'T', TRUE);",
      ],
      [
        "the named argument",
        "throw new ApplicationFailure(message: 'm', type: 'T', nonRetryable: true);",
      ],
      [
        "the class with its namespace",
        "throw new \\Temporal\\Exception\\Failure\\ApplicationFailure('m', 'T', true);",
      ],
    ])("finds %s", (_, statement) => {
      expect(
        onlyActivity(activityWith(`        ${statement}`)).nonRetryableErrors,
      ).toEqual([{ line: 10 }]);
    });

    it("reports the line of true when the arguments span lines", () => {
      const code = activityWith(
        "        throw new ApplicationFailure(",
        "            sprintf('Declined: %s', $code),",
        "            'CardDeclined',",
        "            true,",
        "        );",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([{ line: 13 }]);
    });

    it.each([
      ["a retryable failure", "throw new ApplicationFailure('m', 'T', false);"],
      [
        "a failure with two arguments",
        "throw new ApplicationFailure('m', 'T');",
      ],
      [
        "true inside a nested call",
        "throw new ApplicationFailure(f('m', 'T', true), 'T');",
      ],
      ["true in a string", "throw new ApplicationFailure('m', 'T', 'true');"],
      ["another exception", "throw new RuntimeException('m', 1, true);"],
      [
        "a commented-out throw",
        "// throw new ApplicationFailure('m', 'T', true);",
      ],
    ])("finds none for %s", (_, statement) => {
      expect(
        onlyActivity(activityWith(`        ${statement}`)).nonRetryableErrors,
      ).toEqual([]);
    });
  });

  describe("dependencies", () => {
    it("reads grouped, aliased, function and comma-separated imports", () => {
      const code = lines(
        "<?php",
        "use Aws\\S3\\{S3Client, Exception\\S3Exception};",
        "use Amp\\Postgres\\PostgresConfig as Config, GuzzleHttp\\Client;",
        "use function Monolog\\Handler\\stream;",
        "#[ActivityInterface]",
        "interface Payments { public function charge(); }",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "Aws\\S3", line: 2 },
        { name: "Amp\\Postgres", line: 3 },
        { name: "GuzzleHttp", line: 3 },
        { name: "Monolog\\Handler", line: 4 },
      ]);
    });

    it("leaves out a trait used in a class body, and reads imports in a braced namespace", () => {
      const code = lines(
        "<?php",
        "namespace Acme\\Billing {",
        "    use Stripe\\StripeClient;",
        "    #[ActivityInterface]",
        "    class Payments",
        "    {",
        "        use LoggerAwareTrait;",
        "        use Psr\\Log\\LoggerAwareTrait;",
        "        public function charge() {}",
        "    }",
        "}",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "Stripe", line: 3 },
      ]);
    });

    it("leaves out PHP's own names, global or under its extension namespaces", () => {
      const code = lines(
        "<?php",
        "use DateTimeImmutable;",
        "use \\PDO;",
        "use Random\\Randomizer;",
        "use PgSql\\Connection;",
        "use Dom\\HTMLDocument;",
        "use function json_encode;",
        "use const PHP_EOL;",
        "#[ActivityInterface]",
        "interface Payments { public function charge(); }",
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });

    it("keeps one entry for a package imported from several of its namespaces", () => {
      const code = lines(
        "<?php",
        "use Stripe\\Exception\\CardException;",
        "use Stripe\\StripeClient;",
        "use Stripe\\Exception\\RateLimitException;",
        "#[ActivityInterface]",
        "interface Payments { public function charge(); }",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "Stripe", line: 3 },
      ]);
    });
  });

  describe("configuration and heartbeats", () => {
    it("reads each variable once, with either quote, and ignores a dynamic name", () => {
      const code = activityWith(
        "        $a = getenv('API_KEY');",
        '        $b = \\getenv("API_KEY");',
        "        $c = $_ENV['REGION'];",
        "        $d = getenv($name);",
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "API_KEY", line: 10 },
        { name: "REGION", line: 12 },
      ]);
    });

    it("finds a heartbeat on the Activity class or a context, and none in a comment", () => {
      const code = activityWith(
        "        Activity::heartbeat($progress);",
        "        $context->heartbeat();",
        "        // Activity::heartbeat();",
      );
      expect(onlyActivity(code).heartbeats).toEqual([
        { line: 10 },
        { line: 11 },
      ]);
    });
  });
});

describe("checking PHP code", () => {
  it("refuses a file with several activities, carrying the count", () => {
    const code = lines(
      "<?php",
      "use Temporal\\Activity\\ActivityInterface;",
      "#[ActivityInterface]",
      "interface Payments",
      "{",
      "    public function charge(ChargeRequest $r): ChargeResult;",
      "    public function refund(RefundRequest $r): RefundResult;",
      "}",
    );
    expect(refusalOf(code)).toMatchObject({
      type: refusalTypes.multipleActivities,
      count: 2,
    });
  });

  it("refuses a file that uses the SDK but has no activity as no PHP activity found", () => {
    const code = lines(
      "<?php",
      "use Temporal\\Workflow\\WorkflowInterface;",
      "#[WorkflowInterface]",
      "class GreetingWorkflow { public function run() {} }",
    );
    expect(refusalOf(code)).toMatchObject({
      type: refusalTypes.noActivity,
      sdk: "PHP",
    });
  });

  it("asks for the SDK to be chosen for PHP code with no Temporal markers", () => {
    const code = lines(
      "<?php",
      "class Greeter { public function greet(string $n): string { return $n; } }",
    );
    expect(refusalOf(code)).toMatchObject({
      type: refusalTypes.sdkChoiceNeeded,
      reason: "not-identified",
    });
  });

  it("refuses declared PHP with no activity as no PHP activity found", () => {
    expect(refusalOf("<?php echo 'hi';", "PHP")).toMatchObject({
      type: refusalTypes.noActivity,
      sdk: "PHP",
    });
  });

  it("accepts a declared PHP activity, recording the SDK as declared", () => {
    expect(checkCode(greetOnClass, registeredSdks, "PHP")).toMatchObject({
      sdk: "PHP",
      activity: { name: "greet" },
      provenance: { sdk: "declared" },
    });
  });
});

describe("PHP and Java", () => {
  const identify = (code: string) =>
    identifySdk(toSource(code).text, [...registeredSdks, ...unacceptedSdks]);

  it("resolves a Java activity to Java, not PHP", () => {
    expect(identify(javaActivity)).toMatchObject({
      outcome: "identified",
      sdk: "Java",
    });
    expect(refusalOf(javaActivity)).toMatchObject({
      type: refusalTypes.unacceptedSdk,
      sdk: "Java",
    });
  });

  it("resolves a PHP activity to PHP, not Java, whether it uses the attribute or a docblock annotation", () => {
    const docblock = lines(
      "<?php",
      "use Temporal\\Activity\\ActivityInterface;",
      "/** @ActivityInterface */",
      "interface Greeter { /** @ActivityMethod */ public function greet(string $n): string; }",
    );
    for (const code of [greetOnClass, chargeCardOnInterface, docblock]) {
      expect(identify(code)).toMatchObject({
        outcome: "identified",
        sdk: "PHP",
      });
    }
  });

  it("finds no PHP activity in a Java file declared as PHP", () => {
    expect(refusalOf(javaActivity, "PHP")).toMatchObject({
      type: refusalTypes.noActivity,
      sdk: "PHP",
    });
  });
});

describe("integrations from PHP namespaces", () => {
  const imports = (...names: string[]) =>
    names.map((name, line) => ({ name, line: line + 1 }));

  it.each([
    ["Amp\\Postgres", "Postgres"],
    ["Aws\\S3", "Amazon S3"],
    ["Stripe", "Stripe"],
    ["Stripe\\Exception", "Stripe"],
    ["JoliCode\\Slack", "Slack"],
    ["jolicode\\slack", "Slack"],
  ] as const)("maps %s to %s", (name, integration) => {
    expect(integrationsFor("PHP", imports(name))).toEqual([integration]);
  });

  it.each([
    "Aws",
    "Aws\\DynamoDb",
    "Amp",
    "JoliCode",
    "StripeMock",
    "GuzzleHttp",
  ])("maps %s to nothing", (name) => {
    expect(integrationsFor("PHP", imports(name))).toEqual([]);
  });

  it("reads Stripe, Slack and S3 from detected code, and nothing from PHP's own namespaces", () => {
    const { dependencies } = checkCode(chargeCardOnInterface, registeredSdks);
    expect(integrationsFor("PHP", dependencies)).toEqual([
      "Amazon S3",
      "Slack",
      "Stripe",
    ]);
  });

  it("never reads a built-in namespace as an integration", () => {
    const code = lines(
      "<?php",
      "use Temporal\\Activity\\ActivityInterface;",
      "use PgSql\\Connection;",
      "use PDO;",
      "#[ActivityInterface]",
      "interface Store { public function save(Order $o): void; }",
    );
    const { dependencies } = checkCode(code, registeredSdks);
    expect(dependencies).toEqual([]);
    expect(integrationsFor("PHP", dependencies)).toEqual([]);
  });

  it.each([
    ["DateTimeImmutable", true],
    ["\\Exception", true],
    ["Random\\Randomizer", true],
    ["random\\randomizer", true],
    ["FFI\\CData", true],
    ["Stripe\\StripeClient", false],
    ["RandomLib\\Factory", false],
  ] as const)("reads %s as PHP's own: %s", (name, expected) => {
    expect(isPhpBuiltin(name)).toBe(expected);
  });
});
