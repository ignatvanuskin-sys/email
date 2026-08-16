import { decryptCredentials } from "./crypto";
import { prisma } from "./prisma";

export async function sendTelegram(userId: string, chatId: string, text: string): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const provider = await prisma.provider.findFirst({ where: { userId, kind: "telegram", isActive: true }, orderBy: { createdAt: "desc" } });
  if (!provider) return { ok: false, error: "Telegram provider not connected" };
  try {
    const config = JSON.parse(decryptCredentials(provider.configEncrypted)) as { botToken?: string };
    if (!config.botToken) return { ok: false, error: "Telegram bot token is missing" };
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendMessage`, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }) });
    const payload = await response.json() as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!response.ok || !payload.ok || !payload.result?.message_id) return { ok: false, error: payload.description ?? `Telegram HTTP ${response.status}` };
    return { ok: true, messageId: String(payload.result.message_id) };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Telegram send failed" }; }
}
