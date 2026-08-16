import { processDueJourneys } from "../src/lib/journeyWorker";
import { processSendJobs } from "../src/lib/sendPipeline";
import { processWebhookDeliveries } from "../src/lib/webhookWorker";
import { cleanupExpiredRateLimits } from "../src/lib/rateLimitCleanup";

async function main() { const result = await Promise.all([processSendJobs(), processDueJourneys(), processWebhookDeliveries(), cleanupExpiredRateLimits()]); console.log(JSON.stringify({ sendJobs: result[0], journeys: result[1], webhooks: result[2], rateLimitsCleaned: result[3] })); }
void main();
