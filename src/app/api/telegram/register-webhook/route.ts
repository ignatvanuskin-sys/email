import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api";
import { env } from "@/lib/env";
import { decryptCredentials } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  const provider = await prisma.provider.findFirst({ where: { userId: user.id, kind: "telegram", isActive: true }, orderBy: { createdAt: "desc" } });
  if (!provider) return NextResponse.json({ error: "Telegram provider not connected", code: "TELEGRAM_NOT_CONNECTED" }, { status: 404 });
  let botToken = "";
  try {
    botToken = (JSON.parse(decryptCredentials(provider.configEncrypted)) as { botToken?: string }).botToken ?? "";
  } catch (error) {
    console.error("[telegram-config-error]", { userId: user.id, error });
    return NextResponse.json({ error: "Telegram bot token is unavailable", code: "TELEGRAM_CONFIG_INVALID" }, { status: 500 });
  }
  if (!botToken) return NextResponse.json({ error: "Telegram bot token is missing", code: "TELEGRAM_TOKEN_MISSING" }, { status: 400 });
  const webhookUrl = `${env.APP_URL}/api/telegram/webhook`;
  try {
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/setWebhook`, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json" }, body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }) });
    const payload = await response.json() as { ok?: boolean };
    if (!response.ok || !payload.ok) return NextResponse.json({ error: "Telegram rejected webhook registration", code: "TELEGRAM_REJECTED" }, { status: 502 });
    return NextResponse.json({ ok: true, webhookUrl });
  } catch (error) {
    console.error("[telegram-webhook-error]", { userId: user.id, error });
    return NextResponse.json({ error: "Telegram webhook registration failed", code: "TELEGRAM_REQUEST_FAILED" }, { status: 502 });
  }
}
