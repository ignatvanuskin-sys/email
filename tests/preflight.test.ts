import { describe, expect, it } from "vitest";
import { analyzeCampaignPreflight, checkLinks, extractHttpLinks, senderDomain } from "../src/lib/preflight";

describe("campaign preflight", () => {
  const valid = {
    contents: [{ source: "Welcome", subject: "A useful idea", body: "Hi {{firstName}},\n\nHere is a useful idea for your channel.\n\nUnsubscribe: {{unsubscribeUrl}}" }],
    providerConfigured: true,
    fromAddress: "ClipReach <hello@example.com>",
    sendingDomainStatus: "Verified",
  };

  it("passes valid plain-text campaign content", () => {
    const result = analyzeCampaignPreflight(valid);
    expect(result.ready).toBe(true);
    expect(result.errors).toBe(0);
  });

  it("blocks missing provider, sender and campaign content", () => {
    const result = analyzeCampaignPreflight({ contents: [], providerConfigured: false, fromAddress: null, sendingDomainStatus: null });
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["provider_missing", "from_missing", "content_missing"]));
  });

  it("warns for spam language and an unverified domain without blocking", () => {
    const result = analyzeCampaignPreflight({ ...valid, sendingDomainStatus: "NeedsAttention", contents: [{ source: "A", subject: "ACT NOW!!!!", body: "Click here for free money" }] });
    expect(result.ready).toBe(true);
    expect(result.issues.some((issue) => issue.code === "spam_trigger")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "domain_unverified")).toBe(true);
  });

  it("blocks HTML without meaningful text", () => {
    const result = analyzeCampaignPreflight({ ...valid, contents: [{ source: "HTML", subject: "Hello", body: "<img src=\"x\"><br>" }] });
    expect(result.ready).toBe(false);
    expect(result.issues.some((issue) => issue.code === "text_version_missing")).toBe(true);
  });

  it("extracts unique clean links and parses From domains", () => {
    expect(extractHttpLinks("See https://example.com/a. Then https://example.com/a and https://example.org/x?y=1")).toEqual(["https://example.com/a", "https://example.org/x?y=1"]);
    expect(senderDomain("Sender <hello@Example.COM>")).toBe("example.com");
    expect(senderDomain("bad sender")).toBeNull();
  });

  it("reports non-success and unreachable links as warnings", async () => {
    const fetcher = async (url: string | URL | Request) => {
      if (String(url).includes("missing")) return new Response("", { status: 404 });
      throw new Error("offline");
    };
    const issues = await checkLinks(["https://example.com/missing", "https://example.com/offline"], fetcher as typeof fetch);
    expect(issues).toHaveLength(2);
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
  });
});
