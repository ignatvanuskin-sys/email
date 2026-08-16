import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, userId: user.id } }); if (!endpoint) return notFound("Webhook endpoint not found"); const delivery = await prisma.webhookDelivery.findFirst({ where: { id: new URL(_req.url).searchParams.get("deliveryId") ?? "", endpointId: id } }); if (!delivery) return notFound("Webhook delivery not found"); const updated = await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "Retry", nextAttemptAt: new Date(), lastError: null } }); return ok({ delivery: { id: updated.id, status: updated.status, nextAttemptAt: updated.nextAttemptAt.toISOString() } }); } catch (error) { return handleError(error); }
}
