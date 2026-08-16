import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeCommerceEvent, verifyCommerceSignature, verifyShopifyHmac } from "../src/lib/commerce";

describe("commerce integration", () => {
  it("normalizes Shopify abandoned cart payload", () => {
    const event = normalizeCommerceEvent("shopify", { id: "cart-1", email: "Buyer@Example.com", total_price: "49.90", currency: "USD" }, "checkouts/update");
    expect(event).toMatchObject({ type: "cart.abandoned", email: "buyer@example.com", externalId: "cart-1", properties: { amount: 49.9, currency: "USD" } });
  });

  it("normalizes WooCommerce completed order", () => {
    const event = normalizeCommerceEvent("woocommerce", { id: 10, billing_email: "buyer@example.com", total: "120", status: "completed" }, "order.updated");
    expect(event).toMatchObject({ type: "order.paid", email: "buyer@example.com", externalId: "10", properties: { amount: 120 } });
  });

  it("verifies exact HMAC signatures", () => {
    const raw = JSON.stringify({ id: 1 });
    const signature = createHmac("sha256", "integration-secret").update(raw).digest("hex");
    expect(verifyCommerceSignature(raw, signature, "integration-secret")).toBe(true);
    expect(verifyCommerceSignature(`${raw}x`, signature, "integration-secret")).toBe(false);
  });

  it("verifies Shopify base64 HMAC headers", () => {
    const raw = JSON.stringify({ id: "order-1", total_price: "10.00" });
    const signature = createHmac("sha256", "shopify-webhook-secret").update(raw, "utf8").digest("base64");
    expect(verifyShopifyHmac(raw, signature, "shopify-webhook-secret")).toBe(true);
    expect(verifyShopifyHmac(`${raw}x`, signature, "shopify-webhook-secret")).toBe(false);
  });

  it("falls back to hex commerce signatures when no webhook secret is set", () => {
    const raw = JSON.stringify({ id: 5 });
    const hex = createHmac("sha256", "integration-secret").update(raw).digest("hex");
    expect(verifyCommerceSignature(raw, hex, "integration-secret")).toBe(true);
  });
});
