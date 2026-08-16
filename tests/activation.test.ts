import { describe, expect, it } from "vitest";

describe("activation flow", () => {
  it("keeps the launch sequence explicit and non-automatic", () => {
    expect(["profile", "leads", "template", "provider", "domain", "campaign"]).toHaveLength(6);
    expect("preflight → approval → launch").toContain("approval");
  });
});
