import { describe, expect, it } from "vitest";
import { currentPeriod } from "../src/lib/usage";
import { productionEnvIssues } from "../src/lib/productionEnv";

describe("production security contracts", () => {
  it("uses UTC monthly usage periods", () => {
    expect(currentPeriod(new Date("2026-08-01T00:00:00Z"))).toBe("2026-08");
  });

  it("does not require production secrets in test/dev", () => {
    expect(productionEnvIssues()).toEqual([]);
  });
});
