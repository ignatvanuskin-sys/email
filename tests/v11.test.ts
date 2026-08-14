import { describe, it, expect } from "vitest";
import { applyTemplate, templateVariables } from "../src/lib/emailSender";
import { CAMPAIGN_STATUS, EMAIL_STATUS } from "../src/lib/status";

describe("template variables (v1.1)", () => {
  it("substitutes personalization variables with safe fallback", () => {
    const vars = {
      firstName: "Alex",
      lastName: "Rivera",
      company: "Example Studio",
      website: "https://example.com",
      channel: "YouTube",
    };
    const out = applyTemplate("Hi {{firstName}}, welcome to {{company}} — {{website}} / {{channel}}", vars);
    expect(out).toBe("Hi Alex, welcome to Example Studio — https://example.com / YouTube");
  });

  it("never inserts undefined/null for missing variables", () => {
    const out = applyTemplate("Hello {{firstName}} from {{missing}}", { firstName: "Alex" });
    expect(out).toBe("Hello Alex from ");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("null");
  });

  it("detects template variables", () => {
    const vars = templateVariables("{{firstName}} {{company}} {{customNote}}");
    expect(vars).toEqual(["firstName", "company", "customNote"]);
  });

  it("supports all v1.1 variables", () => {
    const out = applyTemplate("{{firstName}}|{{lastName}}|{{company}}|{{email}}|{{website}}|{{channel}}|{{telegram}}|{{customNote}}", {
      firstName: "A",
      lastName: "B",
      company: "C",
      email: "d@x.com",
      website: "https://w",
      channel: "YT",
      telegram: "@tg",
      customNote: "note",
    });
    expect(out).toBe("A|B|C|d@x.com|https://w|YT|@tg|note");
  });
});

describe("campaign status enum (v1.1)", () => {
  it("has all required campaign statuses", () => {
    expect(CAMPAIGN_STATUS).toMatchObject({
      DRAFT: "Draft",
      SCHEDULED: "Scheduled",
      RUNNING: "Running",
      PAUSED: "Paused",
      COMPLETED: "Completed",
      STOPPED: "Stopped",
    });
  });

  it("email status includes delivery states", () => {
    expect(EMAIL_STATUS).toMatchObject({
      DRAFT: "Draft",
      QUEUED: "Queued",
      SENT: "Sent",
      DELIVERED: "Delivered",
      BOUNCED: "Bounced",
      UNSUBSCRIBED: "Unsubscribed",
    });
  });
});
