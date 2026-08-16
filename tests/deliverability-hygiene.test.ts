import { describe, expect, it } from "vitest";
import { dkimDnsValue, generateDkimKeyPair, normalizeDomain, verifyDomainDns } from "../src/lib/deliverability";
import { inspectEmail, normalizeEmailAddress } from "../src/lib/emailHygiene";
import { createUnsubscribeToken, parseUnsubscribeToken, signValue, verifySignature } from "../src/lib/webhookSecurity";

describe("deliverability", () => {
  it("normalizes valid international domains and rejects URLs", () => {
    expect(normalizeDomain(" Example.COM. ")).toBe("example.com");
    expect(normalizeDomain("пример.рф")).toContain("xn--");
    expect(() => normalizeDomain("example.com/path")).toThrow();
  });

  it("generates a private/public DKIM pair and DNS value", () => {
    const pair = generateDkimKeyPair();
    expect(pair.privateKey).toContain("PRIVATE KEY");
    expect(pair.publicKey).toContain("PUBLIC KEY");
    expect(dkimDnsValue(pair.publicKey)).toMatch(/^v=DKIM1; k=rsa; p=/);
    expect(dkimDnsValue(pair.publicKey)).not.toContain("PRIVATE");
  });

  it("verifies SPF, matching DKIM and DMARC records", async () => {
    const pair = generateDkimKeyPair();
    const records: Record<string, string[][]> = {
      "example.com": [["v=spf1 include:_spf.google.com ~all"]],
      "clipreach._domainkey.example.com": [[dkimDnsValue(pair.publicKey)]],
      "_dmarc.example.com": [["v=DMARC1; p=none"]],
    };
    const result = await verifyDomainDns("example.com", "clipreach", pair.publicKey, async (host) => records[host] ?? []);
    expect(result).toMatchObject({ spfStatus: "Verified", dkimStatus: "Verified", dmarcStatus: "Verified", overallStatus: "Verified" });
  });

  it("does not accept another DKIM public key", async () => {
    const expected = generateDkimKeyPair();
    const other = generateDkimKeyPair();
    const result = await verifyDomainDns("example.com", "clipreach", expected.publicKey, async (host) => {
      if (host.startsWith("clipreach")) return [[dkimDnsValue(other.publicKey)]];
      return [[host.startsWith("_dmarc") ? "v=DMARC1; p=none" : "v=spf1 ~all"]];
    });
    expect(result.dkimStatus).toBe("Invalid");
    expect(result.overallStatus).toBe("NeedsAttention");
  });
});

describe("email hygiene", () => {
  it("normalizes casing and IDN domains", () => {
    expect(normalizeEmailAddress(" User@Example.COM ")).toBe("user@example.com");
    expect(normalizeEmailAddress("Иван@пример.рф")).toBe("иван@пример.рф");
  });

  it("blocks disposable addresses and warns for role addresses", () => {
    expect(inspectEmail("person@mailinator.com")).toMatchObject({ valid: true, disposable: true, quality: "Invalid" });
    expect(inspectEmail("support@example.com")).toMatchObject({ valid: true, roleBased: true, quality: "Risky" });
    expect(inspectEmail("person@example.com")).toMatchObject({ valid: true, roleBased: false, disposable: false, quality: "Valid" });
  });
});

describe("webhook security", () => {
  it("verifies exact HMAC payloads only", () => {
    const payload = JSON.stringify({ eventId: "event-1" });
    expect(verifySignature(payload, signValue(payload))).toBe(true);
    expect(verifySignature(`${payload}x`, signValue(payload))).toBe(false);
  });

  it("round-trips and rejects tampered unsubscribe tokens", () => {
    const token = createUnsubscribeToken("user-1", "message-1");
    expect(parseUnsubscribeToken(token)).toEqual({ userId: "user-1", messageId: "message-1" });
    expect(parseUnsubscribeToken(`${token}x`)).toBeNull();
  });
});
