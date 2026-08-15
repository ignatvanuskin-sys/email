import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../src/lib/unsubscribe";
import { rateLimit } from "../src/lib/rateLimit";

describe("scoped unsubscribe tokens", () => {
  afterEach(() => vi.useRealTimers());

  it("round-trips a signed account/lead token", () => {
    const token = createUnsubscribeToken("user-1", "lead-1", "Person@Example.com");
    expect(verifyUnsubscribeToken(token)).toMatchObject({ userId: "user-1", leadId: "lead-1", email: "person@example.com" });
  });

  it("rejects tampered tokens", () => {
    const token = createUnsubscribeToken("user-1", "lead-1", "person@example.com");
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature.slice(0, -1)}x`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
    const token = createUnsubscribeToken("user-1", "lead-1", "person@example.com");
    vi.setSystemTime(new Date("2026-09-15T00:00:01.000Z"));
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });
});

describe("rate limiting", () => {
  it("returns 429 after the configured number of requests", () => {
    const req = new Request("http://localhost", { headers: { "x-real-ip": `test-${Date.now()}` } });
    expect(rateLimit(req, `security-test-${Date.now()}`, 1, 60_000)).toBeNull();
    expect(rateLimit(req, `security-test-${Date.now()}-other`, 1, 60_000)).toBeNull();
    const key = `security-test-fixed-${Date.now()}`;
    expect(rateLimit(req, key, 1, 60_000)).toBeNull();
    expect(rateLimit(req, key, 1, 60_000)?.status).toBe(429);
  });
});
