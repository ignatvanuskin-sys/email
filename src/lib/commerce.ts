import { createHmac, timingSafeEqual } from "node:crypto";

export type CommerceEvent = { type: "cart.abandoned" | "order.paid" | "product.viewed"; email?: string; externalId?: string; properties: Record<string, unknown>; occurredAt?: Date };

function value(record: Record<string, unknown>, ...keys: string[]): unknown { for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key]; return undefined; }

export function normalizeCommerceEvent(provider: "shopify" | "woocommerce", payload: Record<string, unknown>, topic?: string): CommerceEvent | null {
  const email = String(value(payload, "email", "customer_email", "billing_email", "contact_email") ?? "").trim().toLowerCase() || undefined;
  const externalId = String(value(payload, "id", "order_id", "cart_id", "checkout_id") ?? "").trim() || undefined;
  const total = Number(value(payload, "total_price", "total", "amount", "order_total") ?? 0);
  const source = `${topic ?? ""} ${String(value(payload, "event", "type") ?? "")}`.toLowerCase();
  let type: CommerceEvent["type"] | null = null;
  if (/abandon|cart|checkout/.test(source) && !/paid|complete|order/.test(source)) type = "cart.abandoned";
  else if (/paid|payment|order.complete|purchase/.test(source) || provider === "woocommerce" && Boolean(payload.status === "completed")) type = "order.paid";
  else if (/view|product/.test(source)) type = "product.viewed";
  if (!type) return null;
  return { type, email, externalId, properties: { provider, externalId, amount: Number.isFinite(total) && total >= 0 ? total : 0, currency: value(payload, "currency", "currency_code", "presentment_currency") ?? null, rawType: topic ?? null }, occurredAt: payload.created_at || payload.updated_at ? new Date(String(payload.created_at ?? payload.updated_at)) : undefined };
}

export function verifyCommerceSignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const actual = signature.toLowerCase();
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function verifyShopifyHmac(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const actual = signature;
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
