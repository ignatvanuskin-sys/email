import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashIp, parseTrackingToken } from "@/lib/tracking";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = parseTrackingToken(url.searchParams.get("token") ?? "");
  const target = url.searchParams.get("url") ?? "";
  let destination = "/";
  try { const parsedTarget = new URL(target); if (["http:", "https:"].includes(parsedTarget.protocol)) destination = parsedTarget.toString(); } catch { /* use safe fallback */ }
  if (parsed) {
    const message = await prisma.emailMessage.findFirst({ where: { id: parsed.emailId, userId: parsed.userId }, select: { id: true, campaignId: true } });
    if (message) await prisma.emailTrackingEvent.create({ data: { emailId: message.id, campaignId: message.campaignId, type: "click", elementId: url.searchParams.get("element")?.slice(0, 120), url: destination, userAgent: req.headers.get("user-agent")?.slice(0, 500), ipHash: hashIp(req.headers.get("x-forwarded-for")) } });
  }
  return NextResponse.redirect(destination, { status: 302 });
}
