import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS } from "../src/lib/onboarding";

describe("onboarding contract", () => {
  it("contains a finite activation checklist with navigable destinations", () => {
    expect(ONBOARDING_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(ONBOARDING_STEPS.every((step) => step.id && step.label && step.href.startsWith("/"))).toBe(true);
    expect(new Set(ONBOARDING_STEPS.map((step) => step.id)).size).toBe(ONBOARDING_STEPS.length);
  });
});
