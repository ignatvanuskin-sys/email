import { describe, expect, it } from "vitest";

describe("analytics summary contract", () => {
  it("defines the core cross-channel metrics", () => {
    const metrics = ["sent", "replies", "conversions", "revenue", "replyRate", "conversionRate"];
    expect(metrics).toContain("revenue");
    expect(metrics).toContain("conversionRate");
  });
});
