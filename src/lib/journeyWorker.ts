import { prisma } from "./prisma";
import { applyTemplate, sendEmail } from "./emailSender";
import { checkSuppression } from "./suppression";
import { createUnsubscribeToken } from "./webhookSecurity";
import { env } from "./env";
import { renderEmailHtml } from "./emailHtml";
import { createTrackingToken } from "./tracking";
import { canSendToContact } from "./frequencyGuard";
import { evaluateJourneyConditions } from "./journeyConditions";
import { sendTelegram } from "./telegram";

type GraphContext = { nodes: Array<{ id: string; type: string; title: string; configJson: string }>; edges: Array<{ fromNodeId: string; toNodeId: string; conditionJson?: string | null; label?: string | null }> };

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

function findNodeById(graph: GraphContext, nodeId: string) { return graph.nodes.find((node) => node.id === nodeId) ?? null; }

export async function processDueJourneys(limit = 25): Promise<{ processed: number; sent: number; failed: number }> {
  const due = await prisma.journeyEnrollment.findMany({
    where: { status: "Active", nextRunAt: { lte: new Date() } },
    orderBy: { nextRunAt: "asc" },
    take: limit,
    include: { lead: true, sequence: { include: { steps: { where: { enabled: true }, orderBy: { position: "asc" } } } } },
  });
  let sent = 0;
  let failed = 0;
  for (const enrollment of due) {
    const graph = await loadGraph(enrollment.sequenceId);
    let context: Record<string, unknown> = {};
    try { context = JSON.parse(enrollment.contextJson || "{}"); } catch { context = {}; }
    if (graph.nodes.length > 0) {
      const currentNode = findNodeById(graph, graph.nodes[enrollment.currentStep]?.id ?? "") ?? graph.nodes[0];
      if (!currentNode) { await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Completed", nextRunAt: null } }); continue; }
      const nextId = nextNodeId(graph, currentNode.id, context);
      if (currentNode.type === "exit" || !nextId) { await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Completed", nextRunAt: null } }); continue; }
      if (currentNode.type === "condition") {
        await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: enrollment.currentStep + 1, nextRunAt: new Date(Date.now() + 60_000) } });
        continue;
      }
      const config = (() => { try { return JSON.parse(currentNode.configJson || "{}") as { delayDays?: number; subject?: string; body?: string; telegramChatId?: string }; } catch { return {}; } })();
      if (currentNode.type === "delay") {
        const delayDays = config.delayDays ?? 0;
        await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: enrollment.currentStep + 1, nextRunAt: new Date(Date.now() + delayDays * 86_400_000) } });
        continue;
      }
      const step = enrollment.sequence.steps.find((candidate) => candidate.position === enrollment.currentStep) ?? enrollment.sequence.steps[0];
      const subject = applyTemplate(config.subject ?? step?.subject ?? currentNode.title, { firstName: enrollment.lead.name.split(" ")[0] ?? "", name: enrollment.lead.name, email: enrollment.lead.email ?? "", company: enrollment.lead.companyOrChannel ?? "" });
      const body = applyTemplate(config.body ?? step?.body ?? "", { firstName: enrollment.lead.name.split(" ")[0] ?? "", name: enrollment.lead.name, email: enrollment.lead.email ?? "", company: enrollment.lead.companyOrChannel ?? "" });
      const allowed = await checkSuppression(enrollment.userId, enrollment.lead.email, enrollment.lead.id);
      if (!enrollment.lead.email) { await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Completed", nextRunAt: null, lastError: "No email on lead" } }); continue; }
      if (!allowed.allowed) { await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Cancelled", nextRunAt: null, lastError: allowed.reason } }); continue; }
      const frequency = await canSendToContact(enrollment.userId, enrollment.lead.id, { maxMessages: 3, windowDays: 7 });
      if (!frequency.allowed) { await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { nextRunAt: frequency.nextAllowedAt ?? new Date(Date.now() + 60_000) } }); continue; }
      if (currentNode.type === "telegram") {
        const chatId = config.telegramChatId ?? (typeof context.telegramChatId === "string" ? context.telegramChatId : "");
        const result = chatId ? await sendTelegram(enrollment.userId, chatId, body) : { ok: false as const, error: "telegramChatId missing in event context" };
        if (!result.ok) { failed++; await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Failed", nextRunAt: null, lastError: result.error } }); continue; }
        sent++;
        const nextNode = findNodeById(graph, nextId);
        await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: enrollment.currentStep + 1, nextRunAt: nextNode && nextNode.type === "delay" ? new Date(Date.now() + 60_000) : new Date(Date.now() + 86_400_000), lastError: null } });
        continue;
      }
      const message = await prisma.emailMessage.create({ data: { userId: enrollment.userId, leadId: enrollment.lead.id, sequenceStepId: step?.id ?? null, subject, body, status: "Queued" } });
      const unsubscribe = `${env.APP_URL}/api/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(enrollment.userId, message.id))}`;
      const trackingToken = createTrackingToken(enrollment.userId, message.id);
      await prisma.emailMessage.update({ where: { id: message.id }, data: { trackingToken } });
      const outboundText = `${body}\n\n---\nUnsubscribe: ${unsubscribe}`;
      const rendered = renderEmailHtml(outboundText, {}, { trackingUrl: (url, index) => `${env.APP_URL}/api/tracking/click?token=${encodeURIComponent(trackingToken)}&element=link-${index}&url=${encodeURIComponent(url)}`, pixelUrl: `${env.APP_URL}/api/tracking/open?token=${encodeURIComponent(trackingToken)}` });
      const result = await sendEmail(enrollment.userId, { to: enrollment.lead.email, subject, body: outboundText, html: rendered.html });
      if (!result.ok) { failed++; await prisma.$transaction([prisma.emailMessage.update({ where: { id: message.id }, data: { status: "Failed", errorMessage: result.error } }), prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Failed", nextRunAt: null, lastError: result.error } })]); continue; }
      sent++;
      const nextNode = findNodeById(graph, nextId);
      if (!nextId || !nextNode) { await prisma.$transaction([prisma.emailMessage.update({ where: { id: message.id }, data: { status: "Sent", providerMessageId: result.providerMessageId, sentAt: new Date() } }), prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: enrollment.currentStep + 1, status: "Completed", nextRunAt: null, lastError: null } })]); continue; }
      await prisma.$transaction([prisma.emailMessage.update({ where: { id: message.id }, data: { status: "Sent", providerMessageId: result.providerMessageId, sentAt: new Date() } }), prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: enrollment.currentStep + 1, nextRunAt: nextNode.type === "delay" ? new Date(Date.now() + 60_000) : new Date(Date.now() + 86_400_000), lastError: null } })]);
      continue;
    }
    const step = enrollment.sequence.steps[enrollment.currentStep];
    if (step && !evaluateJourneyConditions(enrollment.sequence.conditionJson, context)) {
      const nextIndex = enrollment.currentStep + 1;
      const nextStep = enrollment.sequence.steps[nextIndex];
      await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: nextStep ? { currentStep: nextIndex, nextRunAt: new Date(Date.now() + nextStep.delayDays * 86_400_000) } : { currentStep: nextIndex, status: "Completed", nextRunAt: null } });
      continue;
    }
    if (!step || !enrollment.lead.email) { await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Completed", nextRunAt: null } }); continue; }
    const allowed = await checkSuppression(enrollment.userId, enrollment.lead.email, enrollment.lead.id);
    if (!allowed.allowed) { await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Cancelled", nextRunAt: null, lastError: allowed.reason } }); continue; }
    const frequency = await canSendToContact(enrollment.userId, enrollment.lead.id, { maxMessages: 3, windowDays: 7 });
    if (!frequency.allowed) { await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { nextRunAt: frequency.nextAllowedAt ?? new Date(Date.now() + 60_000) } }); continue; }
    const vars = { firstName: enrollment.lead.name.split(" ")[0], name: enrollment.lead.name, company: enrollment.lead.companyOrChannel, email: enrollment.lead.email };
    const subject = applyTemplate(step.subject, vars);
    const body = applyTemplate(step.body, vars);
    if (enrollment.sequence.channel === "telegram") {
      const chatId = typeof context.telegramChatId === "string" ? context.telegramChatId : "";
      const result = chatId ? await sendTelegram(enrollment.userId, chatId, body) : { ok: false as const, error: "telegramChatId missing in event context" };
      if (!result.ok) { failed++; await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Failed", nextRunAt: null, lastError: result.error } }); continue; }
      sent++;
      const nextIndex = enrollment.currentStep + 1;
      const nextStep = enrollment.sequence.steps[nextIndex];
      await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: nextStep ? { currentStep: nextIndex, nextRunAt: new Date(Date.now() + nextStep.delayDays * 86_400_000), lastError: null } : { currentStep: nextIndex, status: "Completed", nextRunAt: null, lastError: null } });
      continue;
    }
    const message = await prisma.emailMessage.create({ data: { userId: enrollment.userId, leadId: enrollment.lead.id, sequenceStepId: step.id, subject, body, status: "Queued" } });
    const unsubscribe = `${env.APP_URL}/api/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(enrollment.userId, message.id))}`;
    const trackingToken = createTrackingToken(enrollment.userId, message.id);
    await prisma.emailMessage.update({ where: { id: message.id }, data: { trackingToken } });
    const outboundText = `${body}\n\n---\nUnsubscribe: ${unsubscribe}`;
    const rendered = renderEmailHtml(outboundText, {}, { trackingUrl: (url, index) => `${env.APP_URL}/api/tracking/click?token=${encodeURIComponent(trackingToken)}&element=link-${index}&url=${encodeURIComponent(url)}`, pixelUrl: `${env.APP_URL}/api/tracking/open?token=${encodeURIComponent(trackingToken)}` });
    const result = await sendEmail(enrollment.userId, { to: enrollment.lead.email, subject, body: outboundText, html: rendered.html });
    if (!result.ok) { failed++; await prisma.$transaction([prisma.emailMessage.update({ where: { id: message.id }, data: { status: "Failed", errorMessage: result.error } }), prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "Failed", nextRunAt: null, lastError: result.error } })]); continue; }
    sent++;
    const nextIndex = enrollment.currentStep + 1;
    const nextStep = enrollment.sequence.steps[nextIndex];
    await prisma.$transaction([prisma.emailMessage.update({ where: { id: message.id }, data: { status: "Sent", providerMessageId: result.providerMessageId, sentAt: new Date() } }), prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: nextStep ? { currentStep: nextIndex, nextRunAt: new Date(Date.now() + nextStep.delayDays * 86_400_000), lastError: null } : { currentStep: nextIndex, status: "Completed", nextRunAt: null, lastError: null } })]);
  }
  return { processed: due.length, sent, failed };
}

