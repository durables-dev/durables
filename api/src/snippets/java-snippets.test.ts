import { describe, expect, it } from "vitest";
import type { FactValues } from "../checks/facts";
import type { Address } from "../storage/version-document";
import {
  javaDefaultValue,
  javaSnippets,
  javaWorkerClass,
  javaWorkflowClass,
} from "./java-snippets";

const address: Address = { handle: "kris", name: "send-sms", version: "1.0.0" };

const facts = (changes: Partial<FactValues> = {}): FactValues => ({
  sdk: "Java",
  activity: { name: "sendSms", line: 13 },
  input: "SmsRequest",
  output: "String",
  runsAs: "sync",
  nonRetryableErrors: [],
  configurationRead: [],
  dependencies: [],
  heartbeats: [],
  ...changes,
});

const code = (changes: Partial<FactValues>, label: string) => {
  const found = javaSnippets(facts(changes), address).find(
    (snippet) => snippet.label === label,
  );
  if (found === undefined) {
    throw new Error(`No snippet labelled ${label}`);
  }
  return found.code;
};

describe("Java snippets", () => {
  it("names the workflow and worker classes after the activity, capitalised", () => {
    expect(javaWorkflowClass("sendSms")).toBe("SendSmsWorkflow");
    expect(javaWorkerClass("sendSms")).toBe("SendSmsWorker");
    expect(javaSnippets(facts(), address).map(({ label }) => label)).toEqual([
      "Install",
      "SendSmsWorkflow.java",
      "SendSmsWorker.java",
      "Starter.java",
      "Run",
    ]);
  });

  it("renders the Maven dependency block with each detected dependency", () => {
    expect(
      code(
        {
          dependencies: [
            { name: "com.twilio", line: 3 },
            { name: "org.postgresql", line: 4 },
          ],
        },
        "Install",
      ),
    ).toBe(
      [
        "<!-- Add this to the <dependencies> section of your pom.xml. -->",
        "<dependency>",
        "    <groupId>io.temporal</groupId>",
        "    <artifactId>temporal-sdk</artifactId>",
        "    <version>1.40.0</version>",
        "</dependency>",
        "<!-- Also add the Maven dependencies that provide: com.twilio, org.postgresql -->",
      ].join("\n"),
    );
  });

  it.each([
    ["int", "0"],
    ["long", "0L"],
    ["boolean", "false"],
    ["double", "0d"],
    ["char", "'\\0'"],
    ["SmsRequest", "null"],
    ["List<String>", "null"],
  ])("starts a %s input as %s", (type, value) => {
    expect(javaDefaultValue(type)).toBe(value);
    expect(code({ input: type }, "Starter.java")).toContain(
      `        ${type} input = ${value};\n`,
    );
  });

  it("runs the worker and the starter with Maven", () => {
    expect(
      code(
        { configurationRead: [{ name: "TWILIO_FROM_NUMBER", line: 23 }] },
        "Run",
      ),
    ).toBe(
      [
        "temporal server start-dev",
        "export TWILIO_FROM_NUMBER=...",
        "mvn compile exec:java -Dexec.mainClass=SendSmsWorker",
        "mvn compile exec:java -Dexec.mainClass=Starter",
      ].join("\n"),
    );
  });

  it("sets up no thread pool or executor in the worker", () => {
    expect(code({}, "SendSmsWorker.java")).not.toMatch(/thread|executor/i);
  });

  it("returns nothing from the workflow when the activity has no output", () => {
    const workflow = code({ output: null }, "SendSmsWorkflow.java");
    expect(workflow).toContain("    void run(SmsRequest input);\n");
    expect(workflow).toContain("        activities.sendSms(input);\n");
    expect(code({ output: null }, "Starter.java")).not.toContain("result");
  });
});
