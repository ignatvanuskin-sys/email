import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedCampaign(userId: string, leadCount: number) {
  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name: "concurrency-test",
      status: "Running",
      dailyLimit: 1000,
      frequencyCap: 0,
    },
  });
  const leads = await Promise.all(
    Array.from({ length: leadCount }).map((_, i) =>
      prisma.lead.create({
        data: {
          userId,
          email: `lead${i}-${Math.random().toString(36).slice(2, 8)}@example.test`,
          name: `Lead ${i}`,
        },
      }),
    ),
  );
  await prisma.campaignLead.createMany({
    data: leads.map((lead) => ({ campaignId: campaign.id, leadId: lead.id, status: "Pending" })),
  });
  return { campaignId: campaign.id, leadIds: leads.map((l) => l.id) };
}

async function attemptClaimBatch(campaignId: string) {
  const candidates = await prisma.campaignLead.findMany({
    where: { campaignId, status: "Pending" },
    take: 1000,
  });
  let claimed = 0;
  for (const candidate of candidates) {
    const res = await prisma.campaignLead.updateMany({
      where: { id: candidate.id, status: "Pending" },
      data: { status: "Queued" },
    });
    if (res.count === 1) claimed++;
  }
  return claimed;
}

describe("campaign concurrency: atomic claim", () => {
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `concurrency-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`,
        passwordHash: "x",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("два параллельных claim-а проходят на разные leads (no-overlap)", async () => {
    const { campaignId } = await seedCampaign(userId, 5);

    const [a, b] = await Promise.all([
      attemptClaimBatch(campaignId),
      attemptClaimBatch(campaignId),
    ]);

    const totalClaimed = a + b;
    expect(totalClaimed).toBe(5);

    const queued = await prisma.campaignLead.count({
      where: { campaignId, status: "Queued" },
    });
    const pending = await prisma.campaignLead.count({
      where: { campaignId, status: "Pending" },
    });
    expect(queued).toBe(5);
    expect(pending).toBe(0);
  });

  it("несколько параллельных раундов не оставляют Pending и не дублируют Queued", async () => {
    const { campaignId } = await seedCampaign(userId, 12);
    const rounds = [Promise.all([attemptClaimBatch(campaignId), attemptClaimBatch(campaignId), attemptClaimBatch(campaignId)]), Promise.all([attemptClaimBatch(campaignId), attemptClaimBatch(campaignId)])];
    const results = await Promise.all(rounds);
    const totalClaimed = results.flat().reduce((s, n) => s + n, 0);
    expect(totalClaimed).toBe(12);

    const queued = await prisma.campaignLead.count({
      where: { campaignId, status: "Queued" },
    });
    expect(queued).toBe(12);
  });

  it("имитация repeat send одного и того же campaign lead — unique constraint защищает", async () => {
    const { campaignId, leadIds } = await seedCampaign(userId, 2);
    const logicalKey = `campaign:${campaignId}:lead:${leadIds[0]}`;

    let create1Result: string;
    try {
      await prisma.sendJob.create({
        data: { userId, type: "campaign", logicalKey, payload: "{}", status: "Queued" },
      });
      create1Result = "created";
    } catch (e: any) {
      const isDup =
        e?.code === "P2002" ||
        (typeof e?.message === "string" && (e.message.includes("Unique constraint") || e.message.includes("UNIQUE constraint")));
      create1Result = `error:${isDup ? "duplicate" : `other:${e?.code ?? String(e?.message ?? "").slice(0, 80)}`}`;
    }

    let create2Result: string;
    try {
      await prisma.sendJob.create({
        data: { userId, type: "campaign", logicalKey, payload: "{}", status: "Queued" },
      });
      create2Result = "created";
    } catch (e: any) {
      const isDup =
        e?.code === "P2002" ||
        (typeof e?.message === "string" && (e.message.includes("Unique constraint") || e.message.includes("UNIQUE constraint")));
      create2Result = `error:${isDup ? "duplicate" : `other:${e?.code ?? String(e?.message ?? "").slice(0, 80)}`}`;
    }

    expect(create1Result).toBe("created");
    expect(create2Result).toBe("error:duplicate");

    const jobsForLead = await prisma.sendJob.count({ where: { userId, logicalKey } });
    expect(jobsForLead).toBe(1);
  });
});
