import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey } from "../src/lib/apiKeys";
import { webhookDeliverySignature } from "../src/lib/webhookWorker";

describe("journey and public API contracts", () => {
  it("generates verifiable one-way API keys", () => {
    const generated = generateApiKey();
    expect(generated.key).toMatch(/^cr_live_/);
    expect(generated.prefix).toBe(generated.key.slice(0, 12));
    expect(generated.hash).toBe(hashApiKey(generated.key));
    expect(generated.hash).not.toContain(generated.key);
  });

  it("creates deterministic webhook signatures for the same input", () => {
    const one = webhookDeliverySignature("secret", "1700000000", "{\"id\":1}");
    const two = webhookDeliverySignature("secret", "1700000000", "{\"id\":1}");
    expect(one).toBe(two);
    expect(one).toMatch(/^[a-f0-9]{64}$/);
    expect(webhookDeliverySignature("secret", "1700000001", "{\"id\":1}")).not.toBe(one);
  });
});
