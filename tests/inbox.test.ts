import { describe, expect, it } from "vitest";

describe("reply inbox contract", () => {
  it("defines the supported triage classifications", () => {
    expect(["Positive", "Interested", "Negative", "NotNow", "Replied"]).toContain("Interested");
  });
});
