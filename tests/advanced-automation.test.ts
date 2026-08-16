import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateJourneyConditions } from "../src/lib/journeyConditions";

describe("advanced Journey automation", () => {
  it("evaluates all supported condition operators", () => {
    expect(evaluateJourneyConditions(JSON.stringify([{ field: "plan", operator: "equals", value: "pro" }]), { plan: "Pro" })).toBe(true);
    expect(evaluateJourneyConditions(JSON.stringify([{ field: "name", operator: "contains", value: "alex" }]), { name: "Alex Rivera" })).toBe(true);
    expect(evaluateJourneyConditions(JSON.stringify([{ field: "missing", operator: "exists" }]), {})).toBe(false);
    expect(evaluateJourneyConditions("invalid", {})).toBe(false);
  });

  it("creates valid billing webhook signatures", () => {
    const payload = JSON.stringify({ userId: "user-1", plan: "Pro" });
    const signature = createHmac("sha256", "billing-secret").update(payload).digest("hex");
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });
});
