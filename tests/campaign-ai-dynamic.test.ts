import { describe, expect, it } from "vitest";
import { generateCampaignDraft, generateSubjectVariants } from "../src/lib/campaignAi";
import { parseDynamicContent, renderContent } from "../src/lib/dynamicContent";
import { applyTemplate } from "../src/lib/emailSender";

const client = { type: "Mock" as const, model: "mock-1" };

describe("campaign AI contracts", () => {
  it("returns a typed draft even when mock AI does not provide campaign JSON", async () => {
    const draft = await generateCampaignDraft(client, { goal: "announce an update", audience: "active users", offer: "new plan", tone: "warm", brand: { businessDescription: "SaaS", tone: "warm", audience: "users", offer: "plan", forbidden: "" } });
    expect(draft.subject).toBeTruthy();
    expect(draft.body).toBeTruthy();
    expect(typeof draft.preheader).toBe("string");
  });

  it("keeps subject variant output bounded and typed", async () => {
    const subjects = await generateSubjectVariants(client, { goal: "announce an update", audience: "active users", offer: "new plan", tone: "warm", brand: { businessDescription: "SaaS", tone: "warm", audience: "users", offer: "plan", forbidden: "" } });
    expect(subjects.length).toBeLessThanOrEqual(10);
    expect(Array.isArray(subjects)).toBe(true);
  });
});

describe("dynamic content", () => {
  it("renders a matching conditional block and fallback", () => {
    const document = { blocks: [{ when: [{ field: "niche", operator: "equals" as const, value: "saas" }], content: "SaaS offer for {{firstName}}" }], fallback: "General offer for {{firstName}}" };
    const encoded = `<!--clipreach-dynamic:${JSON.stringify(document)}-->`;
    expect(parseDynamicContent(encoded)).not.toBeNull();
    expect(applyTemplate(encoded, { niche: "SaaS", firstName: "Alex" })).toBe("SaaS offer for Alex");
    expect(applyTemplate(encoded, { niche: "ecommerce", firstName: "Alex" })).toBe("General offer for Alex");
    expect(renderContent("plain", {})).toBe("plain");
  });

  it("rejects malformed dynamic markers", () => {
    expect(parseDynamicContent("<!--clipreach-dynamic:not-json-->")).toBeNull();
  });
});
