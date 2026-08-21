import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../src/lib/unsubscribe";
import { rateLimit } from "../src/lib/rateLimit";
import { signWorkerRequest, verifyWorkerRequest } from "../src/lib/webhookSecurity";

describe("scoped unsubscribe tokens", () => {
  afterEach(() => vi.useRealTimers());

  it("round-trips a signed account/lead token", () => {
    const token = createUnsubscribeToken("user-1", "lead-1", "Person@Example.com");
    expect(verifyUnsubscribeToken(token)).toMatchObject({ userId: "user-1", leadId: "lead-1", email: "person@example.com" });
  });

  it("uses the canonical payload required by the public unsubscribe route", () => {
    const token = createUnsubscribeToken("journey-user", "journey-lead", "Journey@Example.com");
    expect(verifyUnsubscribeToken(token)).toEqual(expect.objectContaining({ userId: "journey-user", leadId: "journey-lead", email: "journey@example.com" }));
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

describe("internal worker authentication", () => {
  it("accepts the canonical timestamp/nonce/body signature within the replay window", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = `nonce-${Date.now()}-abcdefghijklmnop`;
    const body = "{}";
    const signature = signWorkerRequest(timestamp, nonce, body);
    expect(verifyWorkerRequest(body, timestamp, nonce, signature)).toBe(true);
  });

  it("rejects a stale timestamp and a changed body", () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const nonce = "nonce-stale-abcdefghijklmnop";
    const signature = signWorkerRequest(timestamp, nonce, "{}");
    expect(verifyWorkerRequest("{}", timestamp, nonce, signature)).toBe(false);
    expect(verifyWorkerRequest('{"changed":true}', String(Math.floor(Date.now() / 1000)), nonce, signature)).toBe(false);
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
