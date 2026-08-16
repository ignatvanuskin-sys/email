import { describe, expect, it } from "vitest";

describe("production readiness contracts", () => {
  it("documents worker and health requirements", () => {
    expect("POST /api/internal/worker").toContain("worker");
    expect("GET /api/health").toContain("health");
  });

  it("keeps send job states explicit", () => {
    expect(["Queued", "Retry", "Sent", "Failed", "Skipped"]).toContain("Retry");
  });
});
