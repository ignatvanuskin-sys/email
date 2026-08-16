import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const integrations = await prisma.integrationConnection.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    const list = integrations.map((item) => {
      let health = "Active";
      if (item.status === "NeedsAttention") health = "NeedsAttention";
      else if (!item.lastEventAt || item.lastEventAt < cutoff) health = "Idle";
      return {
        id: item.id,
        provider: item.provider,
        name: item.name,
        status: item.status,
        health,
        eventCount: item.eventCount,
        lastEventAt: item.lastEventAt?.toISOString() ?? null,
        lastError: item.lastError,
        createdAt: item.createdAt.toISOString(),
      };
    });
    return ok({ integrations: list, summary: { total: list.length, active: list.filter((i) => i.health === "Active").length, idle: list.filter((i) => i.health === "Idle").length, attention: list.filter((i) => i.health === "NeedsAttention").length } });
  } catch (error) { return handleError(error); }
}
