import { describe, expect, it } from "vitest";
import { createTrackingToken, hashIp, parseTrackingToken } from "../src/lib/tracking";
import { trackingPixel } from "../src/lib/tracking";
import { extractHttpLinks } from "../src/lib/preflight";

describe("analytics tracking", () => {
  it("uses signed tenant-scoped tracking tokens", () => {
    const token = createTrackingToken("user-1", "email-1");
    expect(parseTrackingToken(token)).toEqual({ userId: "user-1", emailId: "email-1" });
    expect(parseTrackingToken(`${token}tampered`)).toBeNull();
  });

  it("hashes IPs and returns a valid transparent pixel", () => {
    expect(hashIp("127.0.0.1")).toMatch(/^[a-f0-9]{32}$/);
    expect(hashIp(null)).toBeNull();
    expect(Buffer.from(trackingPixel(), "base64").subarray(0, 6).toString("ascii")).toBe("GIF89a");
  });

  it("normalizes duplicate tracking links before aggregation", () => {
    expect(extractHttpLinks("https://example.com/a. https://example.com/a https://example.org")).toEqual(["https://example.com/a", "https://example.org"]);
  });
});
