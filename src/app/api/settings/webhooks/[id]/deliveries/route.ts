import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, userId: user.id } }); if (!endpoint) return notFound("Webhook endpoint not found"); const deliveries = await prisma.webhookDelivery.findMany({ where: { endpointId: id }, orderBy: { createdAt: "desc" }, take: 100 }); return ok({ deliveries: deliveries.map((delivery) => ({ id: delivery.id, eventType: delivery.eventType, status: delivery.status, attempts: delivery.attempts, responseCode: delivery.responseCode, lastError: delivery.lastError, nextAttemptAt: delivery.nextAttemptAt.toISOString(), deliveredAt: delivery.deliveredAt?.toISOString() ?? null, createdAt: delivery.createdAt.toISOString() })) }); } catch (error) { return handleError(error); }
}
