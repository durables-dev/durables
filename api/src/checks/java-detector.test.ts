import { describe, expect, it } from "vitest";
import { registeredSdks, sdkRegistry } from "../sdks/registry";
import type { ActivityFacts } from "./facts";
import { identifySdk } from "./identify";
import { integrationsFor } from "./integrations";
import {
  isJavaStandardLibrary,
  javaActivityAnnotation,
  javaActivityInterfaceAnnotation,
  javaAwsServicePackage,
  javaDetector,
  javaEnvironmentRead,
  javaHeartbeatCall,
  javaImplementationClass,
  javaImplementingClass,
  javaImportDeclaration,
  javaMethodDeclaration,
  javaNonRetryableBuilder,
  javaNonRetryableFailure,
  javaOrganisationPackage,
  javaPackageDeclaration,
  javaParameter,
  javaPatterns,
  javaSdkImport,
  javaTypeDeclaration,
  javaTypeName,
  normaliseJavaDependency,
} from "./java-detector";
import type { Pattern } from "./pattern";
import { checkCode } from "./pipeline";
import { CheckRefusal, refusalTypes } from "./refusals";
import { allMatches } from "./scan";
import { MAX_CODE_BYTES } from "./size-limit";
import { toSource } from "./source";
import { phpActivityAttribute, unacceptedSdks } from "./unaccepted-sdks";

const detect = (code: string) =>
  javaDetector.detect(toSource(code), sdkRegistry.Java.isStandardLibrary);

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

/** An activity interface declaring the given method, which is on line 6. */
const interfaceWith = (method: string) =>
  lines(
    "import io.temporal.activity.ActivityInterface;",
    "",
    "@ActivityInterface",
    "public interface Payments {",
    "",
    `    ${method}`,
    "}",
  );

/** An activity interface and its implementation, with the given body lines from line 13. */
const activityWith = (...body: string[]) =>
  lines(
    "import io.temporal.activity.ActivityInterface;",
    "",
    "@ActivityInterface",
    "public interface Payments {",
    "    ChargeResult charge(ChargeRequest request);",
    "}",
    "",
    "class PaymentsImpl implements Payments {",
    "",
    "    @Override",
    "    public ChargeResult charge(ChargeRequest request) {",
    "        // body",
    ...body,
    "        return new ChargeResult();",
    "    }",
    "}",
  );

/** A representative Java activity: an interface, its implementation and all eight facts. */
const chargeCard = lines(
  "package com.acme.payments;",
  "",
  "import com.acme.payments.model.ChargeRequest;",
  "import com.stripe.Stripe;",
  "import com.stripe.model.Charge;",
  "import io.temporal.activity.Activity;",
  "import io.temporal.activity.ActivityInterface;",
  "import io.temporal.activity.ActivityMethod;",
  "import io.temporal.failure.ApplicationFailure;",
  "import java.util.Map;",
  "import javax.annotation.Nullable;",
  "",
  "@ActivityInterface",
  "public interface PaymentActivities {",
  "",
  "    @ActivityMethod",
  "    String chargeCard(ChargeRequest request);",
  "",
  "    class Impl implements PaymentActivities {",
  "",
  "        @Override",
  "        public String chargeCard(ChargeRequest request) {",
  '            Stripe.apiKey = System.getenv("STRIPE_API_KEY");',
  "            if (request.amount() <= 0) {",
  "                throw ApplicationFailure.newNonRetryableFailure(",
  '                        "The amount must be positive", "InvalidAmount");',
  "            }",
  "            Activity.getExecutionContext().heartbeat(request.id());",
  '            Charge charge = Charge.create(Map.of("amount", request.amount()));',
  "            return charge.getId();",
  "        }",
  "    }",
  "}",
);

describe("Java detection patterns", () => {
  it("are named, unique, documented and stateless", () => {
    const names = javaPatterns.map((pattern) => pattern.name);
    expect(new Set(names).size).toBe(names.length);
    for (const pattern of javaPatterns) {
      expect(pattern.name).toMatch(/^java(?:-[a-z]+)+$/);
      expect(pattern.description.length).toBeGreaterThan(0);
      expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
    }
  });

  it("are unique across the registry and the unaccepted SDKs", () => {
    const others = [
      ...registeredSdks
        .filter(({ sdk }) => sdk !== "Java")
        .flatMap(({ recognition }) => [
          ...recognition.sdkMarkers,
          ...recognition.activityMarkers,
          ...recognition.shapeMarkers,
        ]),
      ...unacceptedSdks.flatMap(({ recognition }) => [
        ...recognition.sdkMarkers,
        ...recognition.activityMarkers,
      ]),
    ].map(({ name }) => name);
    for (const { name } of javaPatterns) {
      expect(others).not.toContain(name);
    }
  });

  it("keep the Java markers' names", () => {
    expect(javaSdkImport.name).toBe("java-sdk-import");
    expect(javaActivityAnnotation.name).toBe("java-activity-annotation");
  });

  it.each<[Pattern, string, string]>([
    [
      javaSdkImport,
      "import static io.temporal.activity.Activity.getExecutionContext;",
      "import io.temporalx.Thing;",
    ],
    [
      javaActivityAnnotation,
      "    @ActivityMethod\n    String greet(String name);",
      "    @ActivityMethods",
    ],
    [
      javaImplementationClass,
      "public class GreeterImpl implements Greeter {",
      "public class Greeter { public String greet(String n) { return n; } }",
    ],
    [
      javaActivityInterfaceAnnotation,
      "@io.temporal.activity.ActivityInterface",
      "@ActivityInterfaces",
    ],
    [javaTypeDeclaration, "public interface Payments {", "interfaces = 1;"],
    [
      javaImplementingClass,
      "class Impl extends Base implements Payments {",
      "class Impl extends Base {",
    ],
    [
      javaMethodDeclaration,
      '@ActivityMethod(name = "x") String charge(ChargeRequest request) throws IOException;',
      "return charge(request);",
    ],
    [javaParameter, "final @Valid ChargeRequest request", "String... names"],
    [javaTypeName, "Map<String, List<Charge>>", "Map<String,"],
    [
      javaNonRetryableFailure,
      "throw ApplicationFailure.newNonRetryableFailureWithCause(",
      "throw ApplicationFailure.newFailure(",
    ],
    [
      javaNonRetryableBuilder,
      ".setNonRetryable( true )",
      ".setNonRetryable(false)",
    ],
    [
      javaEnvironmentRead,
      'java.lang.System.getenv("API_KEY")',
      'System.getProperty("API_KEY")',
    ],
    [
      javaImportDeclaration,
      "import com.stripe.model.*;",
      "important com.stripe;",
    ],
    [
      javaPackageDeclaration,
      "package com.acme.payments;",
      "packages com.acme;",
    ],
    [
      javaHeartbeatCall,
      "context.heartbeat(progress);",
      "context.heartbeats(progress);",
    ],
    [
      javaAwsServicePackage,
      "com.amazonaws.services.s3.model",
      "software.amazon.awssdk.core",
    ],
    [javaOrganisationPackage, "com.stripe.model", "stripe"],
  ])("%o matches its case and misses a near miss", (pattern, hit, miss) => {
    expect(pattern.regex.test(hit)).toBe(true);
    expect(pattern.regex.test(miss)).toBe(false);
  });
});

describe("the Java detector", () => {
  describe("a representative activity", () => {
    it("detects all eight facts", () => {
      expect(checkCode(chargeCard, registeredSdks)).toEqual({
        sdk: "Java",
        activity: { name: "chargeCard", line: 17 },
        input: "ChargeRequest",
        output: "String",
        runsAs: "sync",
        nonRetryableErrors: [{ line: 25 }],
        configurationRead: [{ name: "STRIPE_API_KEY", line: 23 }],
        dependencies: [{ name: "com.stripe", line: 4 }],
        heartbeats: [{ line: 28 }],
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
  });

  describe("the activity", () => {
    it("is each abstract method of the @ActivityInterface, not its implementation", () => {
      const facts = onlyActivity(activityWith());
      expect(facts.activity).toEqual({ name: "charge", line: 5 });
    });

    it("is read from an interface whose methods have no @ActivityMethod", () => {
      expect(
        onlyActivity(interfaceWith("void refund(String id);")).activity,
      ).toEqual({ name: "refund", line: 6 });
    });

    it("reads an annotation written with its package", () => {
      const code = lines(
        "@io.temporal.activity.ActivityInterface",
        "public interface Payments {",
        "    void refund(String id);",
        "}",
      );
      expect(onlyActivity(code).activity.name).toBe("refund");
    });

    it("leaves out default and static methods of the interface", () => {
      const code = lines(
        "@ActivityInterface",
        "public interface Payments {",
        "    void refund(String id);",
        '    default String describe() { return "payments"; }',
        "    static Payments create() { return null; }",
        "}",
      );
      expect(detect(code).map(({ activity }) => activity.name)).toEqual([
        "refund",
      ]);
    });

    it("leaves out methods of types nested in the interface", () => {
      const code = lines(
        "@ActivityInterface",
        "public interface Payments {",
        "    void refund(String id);",
        "    interface Helper {",
        "        void help();",
        "    }",
        "    record Refund(String id) {}",
        "}",
      );
      expect(detect(code).map(({ activity }) => activity.name)).toEqual([
        "refund",
      ]);
    });

    it("ignores an @ActivityInterface in a comment or a string", () => {
      const code = lines(
        "// @ActivityInterface",
        "/* @ActivityInterface */",
        'String s = "@ActivityInterface interface X { void y(); }";',
        "public interface Payments {",
        "    void refund(String id);",
        "}",
      );
      expect(detect(code)).toEqual([]);
    });

    it("finds one activity per abstract method, so a file with several is refused", () => {
      const code = lines(
        "import io.temporal.activity.ActivityInterface;",
        "",
        "@ActivityInterface",
        "public interface Payments {",
        "    void refund(String id);",
        "    String charge(ChargeRequest request);",
        "}",
      );
      expect(detect(code)).toHaveLength(2);
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });

    it("finds the activities of two activity interfaces in one file", () => {
      const code = lines(
        "import io.temporal.activity.ActivityInterface;",
        "@ActivityInterface",
        "interface Refunds { void refund(String id); }",
        "@ActivityInterface",
        "interface Charges { void charge(String id); }",
      );
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });
  });

  describe("an implementation-only paste", () => {
    const implementation = lines(
      "package com.acme.greetings;",
      "",
      "public class GreetingActivitiesImpl implements GreetingActivities {",
      "",
      "    private final String greeting;",
      "",
      "    public GreetingActivitiesImpl() {",
      '        this.greeting = System.getenv("GREETING");',
      "    }",
      "",
      "    @Override",
      "    public String composeGreeting(String name) {",
      '        return greeting + " " + name + "!";',
      "    }",
      "",
      "    private String unused() { return greeting; }",
      "",
      "    public static GreetingActivitiesImpl create() { return null; }",
      "",
      "    @Override",
      "    public String toString() { return greeting; }",
      "}",
    );

    it("is accepted with the SDK inferred", () => {
      expect(checkCode(implementation, registeredSdks)).toMatchObject({
        sdk: "Java",
        activity: { name: "composeGreeting", line: 12 },
        input: "String",
        output: "String",
        runsAs: "sync",
        configurationRead: [{ name: "GREETING", line: 8 }],
        provenance: { sdk: "inferred", activity: "detected" },
      });
    });

    it("takes the public instance methods, leaving out constructors, private, static and Object methods", () => {
      expect(
        detect(implementation).map(({ activity }) => activity.name),
      ).toEqual(["composeGreeting"]);
    });

    it("is detected when it imports from the Temporal SDK, which is a Temporal marker", () => {
      const withImport = `import io.temporal.activity.Activity;\n${implementation}`;
      expect(checkCode(withImport, registeredSdks).provenance.sdk).toBe(
        "detected",
      );
    });

    it("is refused when the class has two public methods", () => {
      const code = lines(
        "public class PaymentsImpl implements Payments {",
        "    public void refund(String id) {}",
        "    public void charge(String id) {}",
        "}",
      );
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });
  });

  describe("no activity", () => {
    it("is refused as no activity found for Java when the SDK is imported but nothing declares one", () => {
      const code = lines(
        "import io.temporal.client.WorkflowClient;",
        "",
        "public class Starter {",
        "    public static void main(String[] args) {}",
        "}",
      );
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.noActivity,
        sdk: "Java",
      });
    });

    it("asks for the SDK to be chosen for a Java class that implements nothing", () => {
      const code = lines(
        "public class Greeter {",
        "    public String greet(String name) { return name; }",
        "}",
      );
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.sdkChoiceNeeded,
        reason: "not-identified",
      });
    });

    it("finds none in a declared-Java file with no interface or implementation", () => {
      expect(detect("public class Greeter {}")).toEqual([]);
    });
  });

  describe("input and output", () => {
    it.each([
      ["String charge(ChargeRequest request);", "ChargeRequest", "String"],
      ["void refund(String id);", "String", null],
      [
        "Map<String, List<Charge>> list(com.acme.Query query);",
        "com.acme.Query",
        "Map<String, List<Charge>>",
      ],
      ["byte[] read(final @NotNull Path path);", "Path", "byte[]"],
      ["int count();", null, "int"],
      ["int add(int a, int b);", null, "int"],
      ["void log(String... lines);", null, null],
      ["<T> T echo(T value);", "T", "T"],
      [
        '@ActivityMethod(name = "Charge") String charge(Req r) throws IOException, TimeoutException;',
        "Req",
        "String",
      ],
    ])("reads %s", (method, input, output) => {
      const facts = onlyActivity(interfaceWith(method));
      expect({ input: facts.input, output: facts.output }).toEqual({
        input,
        output,
      });
    });

    it("reads every activity as synchronous", () => {
      expect(onlyActivity(activityWith()).runsAs).toBe("sync");
    });
  });

  describe("non-retryable errors", () => {
    it.each([
      [
        "newNonRetryableFailure",
        'throw ApplicationFailure.newNonRetryableFailure("No card", "NoCard");',
      ],
      [
        "newNonRetryableFailureWithCause",
        'throw ApplicationFailure.newNonRetryableFailureWithCause("No card", "NoCard", cause);',
      ],
      [
        "a builder with setNonRetryable(true)",
        'throw ApplicationFailure.newBuilder().setMessage("No card").setNonRetryable(true).build();',
      ],
    ])("finds %s", (_, line) => {
      expect(
        onlyActivity(activityWith(`        ${line}`)).nonRetryableErrors,
      ).toEqual([{ line: 13 }]);
    });

    it("reports the line of setNonRetryable in a builder over several lines", () => {
      const facts = onlyActivity(
        activityWith(
          "        throw ApplicationFailure.newBuilder()",
          '                .setMessage("No card")',
          "                .setNonRetryable(true)",
          "                .build();",
        ),
      );
      expect(facts.nonRetryableErrors).toEqual([{ line: 15 }]);
    });

    it.each([
      [
        "a retryable failure",
        'throw ApplicationFailure.newFailure("Try again", "Busy");',
      ],
      ["setNonRetryable(false)", ".setNonRetryable(false)"],
      [
        "a commented-out failure",
        '// throw ApplicationFailure.newNonRetryableFailure("x", "y");',
      ],
      [
        "a failure in a string",
        'String s = "ApplicationFailure.newNonRetryableFailure(";',
      ],
    ])("does not count %s", (_, line) => {
      expect(
        onlyActivity(activityWith(`        ${line}`)).nonRetryableErrors,
      ).toEqual([]);
    });
  });

  describe("configuration read", () => {
    it("finds each environment variable once, at its first read", () => {
      const facts = onlyActivity(
        activityWith(
          '        String key = System.getenv("API_KEY");',
          '        String region = java.lang.System.getenv( "REGION" );',
          '        String again = System.getenv("API_KEY");',
        ),
      );
      expect(facts.configurationRead).toEqual([
        { name: "API_KEY", line: 13 },
        { name: "REGION", line: 14 },
      ]);
    });

    it("ignores reads in comments and strings, and reads of a variable's value", () => {
      const facts = onlyActivity(
        activityWith(
          '        // System.getenv("COMMENTED")',
          '        String s = "System.getenv(\\"QUOTED\\")";',
          "        String name = System.getenv(variable);",
        ),
      );
      expect(facts.configurationRead).toEqual([]);
    });
  });

  describe("dependencies", () => {
    const withImports = (...imports: string[]) =>
      lines(
        "package com.acme.payments;",
        "",
        ...imports,
        "import io.temporal.activity.ActivityInterface;",
        "",
        "@ActivityInterface",
        "public interface Payments {",
        "    void refund(String id);",
        "}",
      );

    it("names the package imported from, folding sub-packages into the package above them", () => {
      const facts = onlyActivity(
        withImports(
          "import com.stripe.model.Charge;",
          "import com.stripe.Stripe;",
          "import org.postgresql.ds.PGSimpleDataSource;",
        ),
      );
      expect(facts.dependencies).toEqual([
        { name: "com.stripe", line: 3 },
        { name: "org.postgresql.ds", line: 5 },
      ]);
    });

    it("reads static and on-demand imports", () => {
      const facts = onlyActivity(
        withImports(
          "import static com.slack.api.Slack.getInstance;",
          "import software.amazon.awssdk.services.s3.*;",
        ),
      );
      expect(facts.dependencies).toEqual([
        { name: "com.slack.api", line: 3 },
        { name: "software.amazon.awssdk.services.s3", line: 4 },
      ]);
    });

    it("leaves out the standard library, the Temporal SDK and the file's own package", () => {
      const facts = onlyActivity(
        withImports(
          "import java.util.*;",
          "import java.time.Duration;",
          "import javax.crypto.Cipher;",
          "import io.temporal.failure.ApplicationFailure;",
          "import com.acme.payments.model.Refund;",
        ),
      );
      expect(facts.dependencies).toEqual([]);
    });

    it("ignores imports in comments", () => {
      const facts = onlyActivity(
        withImports("// import com.stripe.Stripe;", "/* import com.x.Y; */"),
      );
      expect(facts.dependencies).toEqual([]);
    });
  });

  describe("heartbeats", () => {
    it("finds each heartbeat, at the line of heartbeat", () => {
      const facts = onlyActivity(
        activityWith(
          "        Activity.getExecutionContext().heartbeat(null);",
          "        context",
          "                .heartbeat(progress);",
        ),
      );
      expect(facts.heartbeats).toEqual([{ line: 13 }, { line: 15 }]);
    });

    it("ignores a heartbeat in a comment", () => {
      const facts = onlyActivity(
        activityWith("        // context.heartbeat(progress);"),
      );
      expect(facts.heartbeats).toEqual([]);
    });
  });

  it("leaves blank what it can't read and still accepts the activity", () => {
    const code = lines(
      "import io.temporal.activity.ActivityInterface;",
      "@ActivityInterface",
      "public interface Payments {",
      "    void ping();",
      "}",
    );
    expect(checkCode(code, registeredSdks)).toMatchObject({
      sdk: "Java",
      activity: { name: "ping" },
      input: null,
      output: null,
      nonRetryableErrors: [],
      configurationRead: [],
      dependencies: [],
      heartbeats: [],
    });
  });
});

describe("Java and PHP", () => {
  const php = lines(
    "<?php",
    "",
    "use Temporal\\Activity\\ActivityInterface;",
    "use Temporal\\Activity\\ActivityMethod;",
    "",
    "#[ActivityInterface]",
    "interface Greeter",
    "{",
    "    #[ActivityMethod]",
    "    public function greet(string $name): string;",
    "}",
  );

  const identify = (code: string) =>
    identifySdk(toSource(code).text, [...registeredSdks, ...unacceptedSdks]);

  it("resolves a PHP activity with #[ActivityInterface] to PHP, not Java", () => {
    expect(identify(php)).toMatchObject({ outcome: "identified", sdk: "PHP" });
    expect(refusalOf(php)).toMatchObject({
      type: refusalTypes.unacceptedSdk,
      sdk: "PHP",
    });
  });

  it("resolves a Java activity to Java, though PHP's attribute pattern takes Java's annotation", () => {
    expect(phpActivityAttribute.regex.test(chargeCard)).toBe(true);
    expect(identify(chargeCard)).toMatchObject({
      outcome: "identified",
      sdk: "Java",
      tier: "detected",
    });
  });

  it("finds no Java activity in PHP code declared as Java", () => {
    expect(detect(php)).toEqual([]);
  });
});

describe("the Java standard library", () => {
  it.each([
    "java.util",
    "java.util.concurrent",
    "javax",
    "javax.crypto",
    "jdk.jfr",
    "org.w3c.dom",
  ])("includes %s", (pkg) => {
    expect(isJavaStandardLibrary(pkg)).toBe(true);
  });

  it.each(["javafx.scene", "javalin", "com.stripe", "org.postgresql"])(
    "leaves out %s",
    (pkg) => {
      expect(isJavaStandardLibrary(pkg)).toBe(false);
    },
  );
});

describe("Java integrations", () => {
  it.each([
    ["org.postgresql", "Postgres"],
    ["org.postgresql.ds", "Postgres"],
    ["software.amazon.awssdk.services.s3", "Amazon S3"],
    ["software.amazon.awssdk.services.s3.model", "Amazon S3"],
    ["com.amazonaws.services.s3", "Amazon S3"],
    ["com.stripe", "Stripe"],
    ["com.stripe.model", "Stripe"],
    ["com.slack.api.methods", "Slack"],
  ])("maps %s to %s", (pkg, integration) => {
    expect(integrationsFor("Java", [{ name: pkg }])).toEqual([integration]);
  });

  it.each([
    "software.amazon.awssdk.services.dynamodb",
    "software.amazon.awssdk.core",
    "com.twilio",
    "java.sql",
  ])("maps %s to no integration", (pkg) => {
    expect(integrationsFor("Java", [{ name: pkg }])).toEqual([]);
  });

  it("normalises a package to its organisation, or its AWS service", () => {
    expect(normaliseJavaDependency("Com.Stripe.Model")).toBe("com.stripe");
    expect(
      normaliseJavaDependency("software.amazon.awssdk.services.s3.model"),
    ).toBe("software.amazon.awssdk.services.s3");
  });

  it("shows an integration from detected Java code and never the standard library", () => {
    const code = lines(
      "import io.temporal.activity.ActivityInterface;",
      "import java.sql.Connection;",
      "import org.postgresql.ds.PGSimpleDataSource;",
      "import com.stripe.Stripe;",
      "@ActivityInterface",
      "public interface Payments {",
      "    void refund(String id);",
      "}",
    );
    const facts = checkCode(code, registeredSdks);
    expect(facts.dependencies.map(({ name }) => name)).toEqual([
      "org.postgresql.ds",
      "com.stripe",
    ]);
    expect(integrationsFor("Java", facts.dependencies)).toEqual([
      "Postgres",
      "Stripe",
    ]);
  });
});

describe("Java detection at the size limit", () => {
  const atLimit = (prefix: string, unit: string) =>
    prefix +
    unit.repeat(Math.floor((MAX_CODE_BYTES - prefix.length) / unit.length));
  const adversarial: [string, string][] = [
    [
      "spaces after a return type",
      atLimit("@ActivityInterface interface A { String", " "),
    ],
    ["a long dotted type", atLimit("@ActivityInterface interface A { a", ".a")],
    [
      "open angle brackets",
      atLimit("@ActivityInterface interface A { List", "<"),
    ],
    ["open brackets", atLimit("@ActivityInterface interface A { void a(", "(")],
    ["stacked annotations", atLimit("public interface A { ", "@B ")],
    ["stacked modifiers", atLimit("class A implements B { ", "public ")],
    ["a long throws clause", atLimit("interface A { void a() throws ", "X, ")],
    ["an unclosed implements clause", atLimit("class A implements ", "B, ")],
    ["a long import", atLimit("import a", ".a")],
    ["new lines", atLimit("@ActivityInterface\n", "\n")],
  ];

  it.each(adversarial)(
    "matches every pattern against %s in under a second",
    (_, code) => {
      for (const pattern of javaPatterns) {
        const started = performance.now();
        allMatches(pattern, code);
        expect(performance.now() - started).toBeLessThan(1000);
      }
    },
  );

  it.each(adversarial)("detects %s in under a second", (_, code) => {
    const started = performance.now();
    detect(code);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
