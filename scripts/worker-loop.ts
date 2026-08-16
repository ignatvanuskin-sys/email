import { processDueJourneys } from "../src/lib/journeyWorker";
import { processSendJobs } from "../src/lib/sendPipeline";
import { processWebhookDeliveries } from "../src/lib/webhookWorker";
import { cleanupExpiredRateLimits } from "../src/lib/rateLimitCleanup";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function main() {
  while (!stopping) {
    try { await Promise.all([processSendJobs(), processDueJourneys(), processWebhookDeliveries(), cleanupExpiredRateLimits()]); }
    catch (error) { console.error("worker iteration failed", error); }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
void main();
