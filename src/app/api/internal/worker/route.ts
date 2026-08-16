import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueJourneys } from "@/lib/journeyWorker";
import { processWebhookDeliveries } from "@/lib/webhookWorker";
import { processSendJobs } from "@/lib/sendPipeline";
import { cleanupExpiredRateLimits } from "@/lib/rateLimitCleanup";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [sendJobs, journeys, webhooks, rateLimitsCleaned] = await Promise.all([processSendJobs(), processDueJourneys(), processWebhookDeliveries(), cleanupExpiredRateLimits()]);
  return NextResponse.json({ ok: true, sendJobs, journeys, webhooks, rateLimitsCleaned });
}
