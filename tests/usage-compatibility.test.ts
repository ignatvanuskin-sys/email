import { describe, expect, it } from "vitest";
import { checkEmailCompatibility } from "../src/lib/emailCompatibility";
import { currentPeriod, limitFor, PLAN_LIMITS } from "../src/lib/usage";

describe("usage metering", () => {
  it("defines stable monthly plans and periods", () => {
    expect(currentPeriod(new Date("2026-08-15T00:00:00Z"))).toBe("2026-08");
    expect(limitFor("Free", "emails")).toBe(PLAN_LIMITS.Free.emails);
  });
});

describe("email compatibility", () => {
  it("flags unsafe and client-specific HTML", () => {
    const issues = checkEmailCompatibility("<script>alert(1)</script><div style=\"display:flex\"><img src=\"x\"></div>");
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["script", "layout", "alt"]));
  });

  it("does not flag a minimal safe email as unsafe", () => {
    expect(checkEmailCompatibility("<p>Hello</p>")).toEqual([]);
  });
});
