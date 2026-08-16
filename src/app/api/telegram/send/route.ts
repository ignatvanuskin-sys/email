import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { sendTelegram } from "@/lib/telegram";

const schema = z.object({ chatId: z.string().min(1).max(100), text: z.string().trim().min(1).max(4096) });
export async function POST(req: Request) { try { const user = await getApiUser(); if (!user) return unauthorized(); const data = schema.parse(await readJson(req)); const result = await sendTelegram(user.id, data.chatId, data.text); if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: 400 }); return ok({ messageId: result.messageId }); } catch (error) { return handleError(error); } }
