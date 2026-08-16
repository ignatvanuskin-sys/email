import { describe, expect, it } from "vitest";
import { hashInvitationToken, roleCan, WORKSPACE_ROLES } from "../src/lib/workspace";

describe("workspace RBAC", () => {
  it("orders roles by responsibility", () => {
    expect(roleCan("Owner", "Admin")).toBe(true);
    expect(roleCan("Admin", "Marketer")).toBe(true);
    expect(roleCan("Viewer", "Marketer")).toBe(false);
    expect(WORKSPACE_ROLES).toContain("Analyst");
  });

  it("hashes invitation tokens one-way", () => {
    const token = "invite-token-value";
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(hashInvitationToken(token)).not.toBe(token);
  });
});
