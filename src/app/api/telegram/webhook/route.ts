import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptCredentials } from "@/lib/crypto";
import { createEvent } from "@/lib/events";
import { env } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Invalid Telegram webhook secret" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const botToken = req.headers.get("x-telegram-bot-token");
  if (!botToken || botToken.length > 256) return NextResponse.json({ error: "Invalid Telegram bot binding" }, { status: 401, headers: { "cache-control": "no-store" } });
  const rate = await consumeRateLimit("telegram:webhook", 600, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "cache-control": "no-store" } });
  const raw = await req.text();
  try {
    const update = JSON.parse(raw) as { update_id?: number; message?: { text?: string; chat?: { id?: number | string }; from?: { username?: string; id?: number } } };
    const updateId = update.update_id;
    const chatId = update.message?.chat?.id;
    const text = update.message?.text ?? "";
    if (!Number.isInteger(updateId) || !chatId) return NextResponse.json({ ok: true, ignored: true }, { headers: { "cache-control": "no-store" } });
    const providers = await prisma.provider.findMany({ where: { kind: "telegram", isActive: true } });
    let processed = 0;
    for (const provider of providers) {
      try {
        const config = JSON.parse(decryptCredentials(provider.configEncrypted)) as { botToken?: string };
        if (config.botToken !== botToken) continue;
        await createEvent({ userId: provider.userId, type: "telegram.message.received", properties: { telegramChatId: String(chatId), text, username: update.message?.from?.username ?? null, telegramUserId: update.message?.from?.id ?? null }, idempotencyKey: `telegram:${provider.id}:${updateId}` });
        processed++;
      } catch { /* isolate malformed provider records */ }
    }
    return NextResponse.json({ ok: true, processed }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Invalid Telegram update" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
