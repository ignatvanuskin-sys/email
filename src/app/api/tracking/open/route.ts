import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashIp, parseTrackingToken, trackingPixel } from "@/lib/tracking";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const parsed = parseTrackingToken(token);
  if (parsed) {
    const message = await prisma.emailMessage.findFirst({ where: { id: parsed.emailId, userId: parsed.userId }, select: { id: true, campaignId: true } });
    if (message) await prisma.emailTrackingEvent.create({ data: { emailId: message.id, campaignId: message.campaignId, type: "open", userAgent: req.headers.get("user-agent")?.slice(0, 500), ipHash: hashIp(req.headers.get("x-forwarded-for")) } });
  }
  return new NextResponse(Buffer.from(trackingPixel(), "base64"), { headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate" } });
}
