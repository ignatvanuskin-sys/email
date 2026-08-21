import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { applyTemplate } from "./emailSender";
import { checkSuppression } from "./suppression";
import { canSendToContact } from "./frequencyGuard";
import { evaluateJourneyConditions } from "./journeyConditions";
import { enqueueSend } from "./sendPipeline";

type GraphContext = {
  nodes: Array<{ id: string; type: string; title: string; configJson: string }>;
  edges: Array<{ fromNodeId: string; toNodeId: string; conditionJson?: string | null; label?: string | null }>;
};

type JourneyResult = { queued: number; failed: number };
type WorkerResult = { processed: number; sent: number; queued: number; failed: number };
type Enrollment = Awaited<ReturnType<typeof loadDueJourneys>>[number];

async function loadGraph(sequenceId: string): Promise<GraphContext> {
  const [nodes, edges] = await Promise.all([
    prisma.sequenceNode.findMany({ where: { sequenceId }, orderBy: { createdAt: "asc" } }),
    prisma.sequenceEdge.findMany({ where: { sequenceId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { nodes, edges };
}

function nextNodeId(graph: GraphContext, fromNodeId: string, context: Record<string, unknown>): string | null {
  const outgoing = graph.edges.filter((edge) => edge.fromNodeId === fromNodeId);
  if (outgoing.length === 0) return null;
  if (outgoing.length === 1) return outgoing[0].toNodeId;
  const matched = outgoing.find((edge) => edge.conditionJson && evaluateJourneyConditions(edge.conditionJson, context));
  return matched?.toNodeId ?? outgoing.find((edge) => !edge.conditionJson)?.toNodeId ?? null;
}

function findNodeById(graph: GraphContext, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId) ?? null;
}

async function loadDueJourneys(now: Date, limit: number) {
  return prisma.journeyEnrollment.findMany({
    where: {
      status: "Active",
      nextRunAt: { lte: now },
      OR: [{ claimUntil: null }, { claimUntil: { lt: now } }],
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
    include: { lead: true, sequence: { include: { steps: { where: { enabled: true }, orderBy: { position: "asc" } } } } },
  });
}

export async function processDueJourneys(limit = 25): Promise<WorkerResult> {
  const now = new Date();
  const due = await loadDueJourneys(now, limit);
  let processed = 0;
  let queued = 0;
  let failed = 0;

  for (const enrollment of due) {
    const claimToken = randomUUID();
    const claimUntil = new Date(Date.now() + 5 * 60_000);
    const claimed = await prisma.journeyEnrollment.updateMany({
      where: {
        id: enrollment.id,
        userId: enrollment.userId,
        status: "Active",
        nextRunAt: { lte: now },
        OR: [{ claimUntil: null }, { claimUntil: { lt: now } }],
      },
      data: { claimToken, claimUntil },
    });
    if (claimed.count === 0) continue;

    processed++;
    try {
      const result = await processClaimedJourney(enrollment, claimUntil);
      queued += result.queued;
      failed += result.failed;
    } catch (error) {
      failed++;
      const reason = error instanceof Error ? error.message.slice(0, 200) : "Journey processing failed";
      await prisma.journeyEnrollment.updateMany({
        where: { id: enrollment.id, userId: enrollment.userId, claimToken },
        data: { status: "Failed", nextRunAt: null, lastError: reason },
      });
    } finally {
      await prisma.journeyEnrollment.updateMany({
        where: { id: enrollment.id, userId: enrollment.userId, claimToken },
        data: { claimToken: null, claimUntil: null },
      });
    }
  }

  return { processed, sent: 0, queued, failed };
}

async function processClaimedJourney(enrollment: Enrollment, claimUntil: Date): Promise<JourneyResult> {
  let context: Record<string, unknown> = {};
  try { context = JSON.parse(enrollment.contextJson || "{}"); } catch { context = {}; }

  const graph = await loadGraph(enrollment.sequenceId);
  if (graph.nodes.length > 0) {
    return processGraphJourney(enrollment, graph, context, claimUntil);
  }
  return processLinearJourney(enrollment, context, claimUntil);
}

async function processGraphJourney(enrollment: Enrollment, graph: GraphContext, context: Record<string, unknown>, claimUntil: Date): Promise<JourneyResult> {
  const currentNode = findNodeById(graph, graph.nodes[enrollment.currentStep]?.id ?? "") ?? graph.nodes[0];
  if (!currentNode) {
    await completeEnrollment(enrollment);
    return { queued: 0, failed: 0 };
  }

  const nextId = nextNodeId(graph, currentNode.id, context);
  if (currentNode.type === "exit" || !nextId) {
    await completeEnrollment(enrollment);
    return { queued: 0, failed: 0 };
  }
  if (currentNode.type === "condition") {
    await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: enrollment.currentStep + 1, nextRunAt: new Date(Date.now() + 60_000) } });
    return { queued: 0, failed: 0 };
  }
  const config = parseNodeConfig(currentNode.configJson);
  if (currentNode.type === "delay") {
    const delayDays = Math.max(0, config.delayDays ?? 0);
    await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: enrollment.currentStep + 1, nextRunAt: new Date(Date.now() + delayDays * 86_400_000) } });
    return { queued: 0, failed: 0 };
  }

  const step = enrollment.sequence.steps.find((candidate) => candidate.position === enrollment.currentStep) ?? enrollment.sequence.steps[0];
  const vars = journeyVars(enrollment);
  const subject = applyTemplate(config.subject ?? step?.subject ?? currentNode.title, vars);
  const body = applyTemplate(config.body ?? step?.body ?? "", vars);
  return enqueueJourneyMessage(enrollment, subject, body, {
    stepId: step?.id,
    channel: currentNode.type === "telegram" ? "telegram" : undefined,
    telegramChatId: config.telegramChatId ?? (typeof context.telegramChatId === "string" ? context.telegramChatId : undefined),
    advanceTo: enrollment.currentStep + 1,
    nextRunAt: nextId && findNodeById(graph, nextId)?.type === "delay" ? new Date(Date.now() + 60_000) : new Date(Date.now() + 86_400_000),
    complete: !nextId || !findNodeById(graph, nextId),
    claimUntil,
  });
}

async function processLinearJourney(enrollment: Enrollment, context: Record<string, unknown>, claimUntil: Date): Promise<JourneyResult> {
  const step = enrollment.sequence.steps[enrollment.currentStep];
  if (step && !evaluateJourneyConditions(enrollment.sequence.conditionJson, context)) {
    const nextIndex = enrollment.currentStep + 1;
    const nextStep = enrollment.sequence.steps[nextIndex];
    await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: nextStep ? { currentStep: nextIndex, nextRunAt: new Date(Date.now() + nextStep.delayDays * 86_400_000) } : { currentStep: nextIndex, status: "Completed", nextRunAt: null } });
    return { queued: 0, failed: 0 };
  }
  if (!step) {
    await completeEnrollment(enrollment);
    return { queued: 0, failed: 0 };
  }
  const vars = journeyVars(enrollment);
  const subject = applyTemplate(step.subject, vars);
  const body = applyTemplate(step.body, vars);
  const nextIndex = enrollment.currentStep + 1;
  const nextStep = enrollment.sequence.steps[nextIndex];
  return enqueueJourneyMessage(enrollment, subject, body, {
    stepId: step.id,
    channel: enrollment.sequence.channel === "telegram" ? "telegram" : undefined,
    telegramChatId: typeof context.telegramChatId === "string" ? context.telegramChatId : undefined,
    advanceTo: nextIndex,
    nextRunAt: nextStep ? new Date(Date.now() + nextStep.delayDays * 86_400_000) : null,
    complete: !nextStep,
    claimUntil,
  });
}

async function enqueueJourneyMessage(
  enrollment: Enrollment,
  subject: string,
  body: string,
  options: { stepId?: string; channel?: string; telegramChatId?: string; advanceTo: number; nextRunAt: Date | null; complete: boolean; claimUntil: Date },
): Promise<JourneyResult> {
  if (!enrollment.lead.email && options.channel !== "telegram") {
    await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Completed", nextRunAt: null, lastError: "No email on lead" } });
    return { queued: 0, failed: 0 };
  }
  if (enrollment.lead.email) {
    const allowed = await checkSuppression(enrollment.userId, enrollment.lead.email, enrollment.lead.id);
    if (!allowed.allowed) {
      await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Cancelled", nextRunAt: null, lastError: allowed.reason } });
      return { queued: 0, failed: 0 };
    }
    const frequency = await canSendToContact(enrollment.userId, enrollment.lead.id, { maxMessages: 3, windowDays: 7 });
    if (!frequency.allowed) {
      await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { nextRunAt: frequency.nextAllowedAt ?? new Date(Date.now() + 60_000) } });
      return { queued: 0, failed: 0 };
    }
  }

  const dedupeKey = `journey:${enrollment.id}:${options.advanceTo - 1}`;
  const didQueue = await enqueueSend(enrollment.userId, "journey", {
    enrollmentId: enrollment.id,
    stepId: options.stepId,
    leadId: enrollment.lead.id,
    subject,
    body,
    dedupeKey,
    journeyAdvanceTo: options.advanceTo,
    journeyNextRunAt: options.nextRunAt?.toISOString() ?? null,
    journeyComplete: options.complete,
    channel: options.channel,
    telegramChatId: options.telegramChatId,
  });
  if (!didQueue) {
    await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { nextRunAt: new Date(Date.now() + 60_000), lastError: "Outreach paused" } });
    return { queued: 0, failed: 0 };
  }
  await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { nextRunAt: options.nextRunAt ?? options.claimUntil, lastError: "Outbound job queued" } });
  return { queued: 1, failed: 0 };
}

function parseNodeConfig(raw: string): { delayDays?: number; subject?: string; body?: string; telegramChatId?: string } {
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

function journeyVars(enrollment: Enrollment) {
  return {
    firstName: enrollment.lead.name.split(" ")[0] ?? "",
    name: enrollment.lead.name,
    email: enrollment.lead.email ?? "",
    company: enrollment.lead.companyOrChannel ?? "",
  };
}

async function completeEnrollment(enrollment: Enrollment) {
  await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Completed", nextRunAt: null, lastError: null } });
}
