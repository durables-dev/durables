import { listingNameSchema, listingTitleSchema } from "@durables/schemas";
import { describe, expect, test } from "vitest";
import {
  activityNameWords,
  defaultName,
  defaultTitle,
} from "./listing-defaults";

describe("the default title and name", () => {
  test("snake_case: post_slack_message", () => {
    expect(defaultTitle("post_slack_message")).toBe("Post slack message");
    expect(defaultName("post_slack_message")).toBe("post-slack-message");
  });

  test("camelCase: chargeCard", () => {
    expect(defaultTitle("chargeCard")).toBe("Charge card");
    expect(defaultName("chargeCard")).toBe("charge-card");
  });

  test("PascalCase: ChargeCard", () => {
    expect(defaultTitle("ChargeCard")).toBe("Charge card");
    expect(defaultName("ChargeCard")).toBe("charge-card");
  });

  test("a single word", () => {
    expect(defaultTitle("greet")).toBe("Greet");
    expect(defaultName("greet")).toBe("greet");
  });
});

describe("digits and consecutive capitals", () => {
  test("digits stay with the word before them", () => {
    expect(defaultTitle("upload_to_s3")).toBe("Upload to s3");
    expect(defaultName("upload_to_s3")).toBe("upload-to-s3");
    expect(defaultName("uploadToS3")).toBe("upload-to-s3");
    expect(defaultName("getV2Item")).toBe("get-v2-item");
  });

  test("a run of digits on its own is a word", () => {
    expect(defaultName("retry_3_times")).toBe("retry-3-times");
  });

  test("a run of capitals is one word, ending before a capitalised word", () => {
    expect(activityNameWords("parseHTTPResponse")).toEqual([
      "parse",
      "http",
      "response",
    ]);
    expect(defaultTitle("parseHTTPResponse")).toBe("Parse http response");
    expect(defaultName("parseHTTPResponse")).toBe("parse-http-response");
    expect(defaultName("S3Upload")).toBe("s3-upload");
    expect(defaultName("ABTest")).toBe("ab-test");
  });

  test("a run of capitals at the end is one word", () => {
    expect(defaultName("sendSMS")).toBe("send-sms");
  });

  test("an all-capitals snake_case name", () => {
    expect(defaultTitle("SEND_EMAIL")).toBe("Send email");
    expect(defaultName("SEND_EMAIL")).toBe("send-email");
  });
});

describe("separators and characters the name rule refuses", () => {
  test("leading, trailing and repeated underscores are left out", () => {
    expect(defaultTitle("__post__slack_")).toBe("Post slack");
    expect(defaultName("__post__slack_")).toBe("post-slack");
  });

  test("a dollar sign separates words", () => {
    expect(defaultName("fetch$Rates")).toBe("fetch-rates");
  });

  test("accents are removed from the name and kept in the title", () => {
    expect(defaultTitle("créer_facture")).toBe("Créer facture");
    expect(defaultName("créer_facture")).toBe("creer-facture");
  });

  test("a name with no words gives no defaults", () => {
    expect(defaultTitle("_")).toBe("");
    expect(defaultName("_")).toBe("");
    expect(defaultTitle("")).toBe("");
    expect(defaultName("")).toBe("");
  });
});

describe("names outside the length rules", () => {
  test("a name over 64 characters is cut to 64 and passes the name rule", () => {
    const activityName = Array.from({ length: 20 }, () => "word").join("_");
    const name = defaultName(activityName);

    expect(name).toHaveLength(64);
    expect(name.startsWith("word-word-")).toBe(true);
    expect(listingNameSchema.safeParse(name).success).toBe(true);
  });

  test("a cut that would end on a hyphen drops the hyphen", () => {
    // 63 characters of words, then a hyphen at position 64.
    const activityName = `${"a".repeat(63)}_tail`;
    const name = defaultName(activityName);

    expect(name).toBe("a".repeat(63));
    expect(listingNameSchema.safeParse(name).success).toBe(true);
  });

  test("a name under 3 characters gives no default name, and 3 does", () => {
    expect(defaultName("go")).toBe("");
    expect(defaultName("ab_")).toBe("");
    expect(defaultName("a_b")).toBe("a-b");
  });

  test("a name under 3 characters still gives a title", () => {
    expect(defaultTitle("go")).toBe("Go");
  });

  test("a title over 80 characters is cut to 80 and passes the title rule", () => {
    const activityName = Array.from({ length: 20 }, () => "word").join("_");
    const title = defaultTitle(activityName);

    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith(" ")).toBe(false);
    expect(listingTitleSchema.safeParse(title).success).toBe(true);
  });
});
