import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeLikeSignature } from "../src/lib/stripe";
import { hashOAuthState } from "../src/lib/oauthState";
import { generateAutomation } from "../src/lib/aiAutomation";

describe("production integration security", () => {
  it("verifies fresh Stripe-like signatures and rejects stale replays", () => {
    const payload = "{\"type\":\"customer.subscription.updated\"}";
    const now = Math.floor(Date.now() / 1000);
    const timestamp = String(now);
    const signature = `t=${timestamp},v1=${createHmac("sha256", "stripe-secret").update(`${timestamp}.${payload}`).digest("hex")}`;
    expect(verifyStripeLikeSignature(payload, signature, "stripe-secret", now)).toBe(true);
    expect(verifyStripeLikeSignature(`${payload}x`, signature, "stripe-secret", now)).toBe(false);
    const staleTimestamp = String(now - 301);
    const staleSignature = `t=${staleTimestamp},v1=${createHmac("sha256", "stripe-secret").update(`${staleTimestamp}.${payload}`).digest("hex")}`;
    expect(verifyStripeLikeSignature(payload, staleSignature, "stripe-secret", now)).toBe(false);
  });

  it("hashes OAuth state without exposing raw value", () => {
    expect(hashOAuthState("oauth-state")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOAuthState("oauth-state")).not.toBe("oauth-state");
  });
});

describe("AI automation contract", () => {
  it("returns validated mock automation shape", async () => {
    const result = await generateAutomation({ type: "Mock", model: "mock" }, "After signup, target Pro users and exit after purchase");
    expect(Array.isArray(result.conditions)).toBe(true);
    expect(result.conditions.every((condition) => ["equals", "not_equals", "contains", "exists"].includes(condition.operator))).toBe(true);
    expect(result.conditions.length).toBeLessThanOrEqual(10);
  });
});
