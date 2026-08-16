import { createHmac } from "node:crypto";
import { prisma } from "./prisma";
import { decryptCredentials } from "./crypto";

export function webhookDeliverySignature(secret: string, timestamp: string, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export async function processWebhookDeliveries(limit = 25, fetcher: typeof fetch = fetch): Promise<{ processed: number; delivered: number; failed: number }> {
  const deliveries = await prisma.webhookDelivery.findMany({ where: { status: { in: ["Pending", "Retry"] }, nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" }, take: limit, include: { endpoint: true } });
  let delivered = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = decryptCredentials(delivery.endpoint.secretEncrypted);
    try {
      const response = await fetcher(delivery.endpoint.url, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json", "user-agent": "ClipReach-Webhooks/1.0", "x-clipreach-timestamp": timestamp, "x-clipreach-signature": webhookDeliverySignature(secret, timestamp, delivery.payload) }, body: delivery.payload });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      delivered++;
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "Delivered", attempts: { increment: 1 }, responseCode: response.status, deliveredAt: new Date(), lastError: null } });
    } catch (error) {
      failed++;
      const attempts = delivery.attempts + 1;
      const exhausted = attempts >= 5;
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: exhausted ? "Failed" : "Retry", attempts, nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** (attempts - 1))), lastError: error instanceof Error ? error.message.slice(0, 1000) : "Delivery failed" } });
    }
  }
  return { processed: deliveries.length, delivered, failed };
}
