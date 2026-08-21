import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { processDueJourneys } from "@/lib/journeyWorker";
import { processWebhookDeliveries } from "@/lib/webhookWorker";
import { processSendJobs } from "@/lib/sendPipeline";
import { cleanupExpiredRateLimits } from "@/lib/rateLimitCleanup";
import { verifyWorkerRequest } from "@/lib/webhookSecurity";

const WORKER_TASK_TIMEOUT_MS = 45_000;
const WORKER_SIGNATURE_TOLERANCE_SECONDS = 300;

type WorkerTaskResult = {
  ok: boolean;
  result?: unknown;
  code?: string;
};

export async function POST(req: Request) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-worker-timestamp");
  const nonce = req.headers.get("x-worker-nonce");
  const signature = req.headers.get("x-worker-signature");

  if (!env.CRON_SECRET || !verifyWorkerRequest(rawBody, timestamp, nonce, signature, Math.floor(Date.now() / 1000), WORKER_SIGNATURE_TOLERANCE_SECONDS)) {
    return NextResponse.json({ error: "Unauthorized", code: "WORKER_UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const now = new Date();
  await prisma.workerNonce.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
  try {
    await prisma.workerNonce.create({
      data: {
        nonce: nonce!,
        expiresAt: new Date(now.getTime() + WORKER_SIGNATURE_TOLERANCE_SECONDS * 1000),
      },
    });
  } catch {
    // The primary key makes a nonce single-use across all application replicas.
    return NextResponse.json({ error: "Unauthorized", code: "WORKER_REPLAYED" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const tasks: Record<string, () => Promise<unknown>> = {
    sendJobs: processSendJobs,
    journeys: processDueJourneys,
    webhooks: processWebhookDeliveries,
    rateLimitsCleaned: cleanupExpiredRateLimits,
  };
  const taskResults = await Promise.all(Object.entries(tasks).map(async ([name, task]): Promise<[string, WorkerTaskResult]> => {
    try {
      const result = await withTimeout(task(), WORKER_TASK_TIMEOUT_MS);
      return [name, { ok: true, result }];
    } catch (error) {
      console.error("[worker-task-failed]", { task: name, requestId: randomUUID(), error });
      return [name, { ok: false, code: "WORKER_TASK_FAILED" }];
    }
  }));

  const resultObject = Object.fromEntries(taskResults);
  const allSucceeded = taskResults.every(([, result]) => result.ok);
  return NextResponse.json({ ok: allSucceeded, tasks: resultObject }, { status: allSucceeded ? 200 : 207, headers: { "cache-control": "no-store" } });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("worker task timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
