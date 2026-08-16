import { describe, expect, it } from "vitest";
import { optimalSendHour } from "../src/lib/frequencyGuard";

describe("frequency and send time policies", () => {
  it("chooses the most common engagement hour with deterministic tie break", () => {
    expect(optimalSendHour([9, 10, 10, 10, 9])).toBe(10);
    expect(optimalSendHour([14, 9])).toBe(9);
    expect(optimalSendHour([])).toBe(10);
  });
});
