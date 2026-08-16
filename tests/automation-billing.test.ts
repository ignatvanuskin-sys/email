import { describe, expect, it } from "vitest";
import { evaluateJourneyConditions } from "../src/lib/journeyConditions";
import { PLAN_CATALOG } from "../src/lib/billing";

describe("journey automation", () => {
  it("evaluates all supported condition operators", () => {
    expect(evaluateJourneyConditions('[{"field":"plan","operator":"equals","value":"pro"}]', { plan: "Pro" })).toBe(true);
    expect(evaluateJourneyConditions('[{"field":"name","operator":"contains","value":"alex"}]', { name: "Alex Rivera" })).toBe(true);
    expect(evaluateJourneyConditions('[{"field":"missing","operator":"exists"}]', {})).toBe(false);
    expect(evaluateJourneyConditions("invalid", {})).toBe(false);
  });
});

describe("billing catalog", () => {
  it("contains ordered plan options with limits", () => {
    expect(PLAN_CATALOG.map((plan) => plan.id)).toEqual(["Free", "Pro", "Agency"]);
    expect(PLAN_CATALOG.every((plan) => plan.priceMonthly >= 0 && plan.limits.emails > 0)).toBe(true);
  });
});
