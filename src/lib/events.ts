import { prisma } from "./prisma";

export type CreateEventInput = {
  userId: string;
  type: string;
  leadId?: string | null;
  email?: string | null;
  properties?: Record<string, unknown>;
  idempotencyKey?: string | null;
  occurredAt?: Date;
};

export async function createEvent(input: CreateEventInput) {
  let leadId = input.leadId ?? null;
  if (!leadId && input.email) {
    const lead = await prisma.lead.findUnique({ where: { userId_email: { userId: input.userId, email: input.email.trim().toLowerCase() } }, select: { id: true } });
    leadId = lead?.id ?? null;
  }
  if (input.idempotencyKey) {
    const existing = await prisma.event.findUnique({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } } });
    if (existing) return { event: existing, created: false, enrollments: 0 };
  }
  const event = await prisma.event.create({ data: {
    userId: input.userId,
    leadId,
    type: input.type,
    properties: JSON.stringify(input.properties ?? {}),
    idempotencyKey: input.idempotencyKey ?? null,
    occurredAt: input.occurredAt ?? new Date(),
  } });
  if (leadId) {
    const activeEnrollments = await prisma.journeyEnrollment.findMany({ where: { userId: input.userId, leadId, status: "Active" }, include: { sequence: { select: { goalEventType: true, exitEventType: true } } } });
    for (const enrollment of activeEnrollments) {
      if (enrollment.sequence.goalEventType === input.type) await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Completed", nextRunAt: null, lastError: null } });
      else if (enrollment.sequence.exitEventType === input.type) await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Cancelled", nextRunAt: null, lastError: "Exit event received" } });
    }
  }
  let enrollments = 0;
  if (leadId) {
    const sequences = await prisma.sequence.findMany({ where: { userId: input.userId, triggerType: input.type, isActive: true }, include: { steps: { where: { enabled: true }, orderBy: { position: "asc" }, take: 1 } } });
    for (const sequence of sequences) {
      const firstStep = sequence.steps[0];
      if (!firstStep) continue;
      const nextRunAt = new Date(Date.now() + firstStep.delayDays * 86_400_000);
      const result = await prisma.journeyEnrollment.upsert({
        where: { sequenceId_leadId: { sequenceId: sequence.id, leadId } },
        create: { userId: input.userId, sequenceId: sequence.id, leadId, eventId: event.id, nextRunAt, contextJson: JSON.stringify(input.properties ?? {}) },
        update: {},
      });
      if (result.eventId === event.id) enrollments++;
    }
  }
  await enqueueWebhookDeliveries(input.userId, "event.received", { id: event.id, type: event.type, leadId: event.leadId, properties: input.properties ?? {}, occurredAt: event.occurredAt.toISOString() });
  return { event, created: true, enrollments };
}

export async function enqueueWebhookDeliveries(userId: string, eventType: string, data: unknown) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { userId, isActive: true } });
  const matching = endpoints.filter((endpoint) => endpoint.events.split(",").map((value) => value.trim()).includes(eventType) || endpoint.events.includes("*"));
  if (!matching.length) return;
  const payload = JSON.stringify({ id: crypto.randomUUID(), type: eventType, createdAt: new Date().toISOString(), data });
  await prisma.webhookDelivery.createMany({ data: matching.map((endpoint) => ({ endpointId: endpoint.id, eventType, payload })) });
}
