import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { leadCreateSchema } from "@/lib/validation";
import { mapLead } from "@/lib/serialize";

export async function GET(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const tier = url.searchParams.get("tier"); // HOT | WARM | COLD

    const leads = await prisma.lead.findMany({
      where: {
        userId: user.id,
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { companyOrChannel: { contains: q } },
                { email: { contains: q } },
                { niche: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ leadScore: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { emails: true, replies: true, followUps: true } },
      },
    });

    const filtered = tier
      ? leads.filter((l) => {
          if (tier === "HOT") return l.leadScore >= 80;
          if (tier === "WARM") return l.leadScore >= 50 && l.leadScore < 80;
          return l.leadScore < 50;
        })
      : leads;

    return ok({ leads: filtered.map(mapLead) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = leadCreateSchema.parse(body);

    const email = d.email?.toLowerCase().trim() || null;
    if (email) {
      const dup = await prisma.lead.findUnique({
        where: { userId_email: { userId: user.id, email } },
      });
      if (dup) {
        return NextResponse.json(
          { error: `A lead with email ${email} already exists` },
          { status: 409 },
        );
      }
    }

    const lead = await prisma.lead.create({
      data: {
        userId: user.id,
        name: d.name,
        companyOrChannel: d.companyOrChannel,
        email,
        websiteUrl: d.websiteUrl,
        youtubeUrl: d.youtubeUrl,
        instagramUrl: d.instagramUrl,
        telegramUrl: d.telegramUrl,
        niche: d.niche,
        followersCount: d.followersCount,
        contentActivity: d.contentActivity,
        longFormCount: d.longFormCount,
        shortFormCount: d.shortFormCount,
        growthSignal: d.growthSignal,
        commercialPotential: d.commercialPotential,
        status: "New",
      },
    });

    await prisma.activity.create({
      data: { userId: user.id, leadId: lead.id, type: "LeadCreated", payload: JSON.stringify({}) },
    });

    return ok({ lead: mapLead(lead) }, 201);
  } catch (err) {
    return handleError(err);
  }
}