import { prisma } from "@/lib/prisma";
import { getApiUser, badRequest, ok, readJson, unauthorized } from "@/lib/api";
import { decryptCredentials } from "@/lib/crypto";
import { chatOpenRouter, OpenRouterError } from "@/lib/openrouter";

export async function POST(req: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  const body = await readJson(req) as { platform?: string; apiKey?: string; model?: string };
  if (body.platform !== "OpenRouter") return badRequest("Проверка доступна для OpenRouter");

  let apiKey = body.apiKey?.trim();
  let model = body.model?.trim();
  if (!apiKey) {
    const provider = await prisma.provider.findFirst({
      where: { userId: user.id, kind: "ai", isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (provider) {
      const config = JSON.parse(decryptCredentials(provider.configEncrypted)) as { platform?: string; apiKey?: string; model?: string };
      if (config.platform === "OpenRouter") {
        apiKey = config.apiKey;
        model ||= config.model;
      }
    }
  }
  if (!apiKey) return badRequest("Введите API-ключ OpenRouter");
  if (!model) return badRequest("Выберите модель OpenRouter");
  try {
    await chatOpenRouter(apiKey, model, "Ответь одним словом.", "Готов?");
    return ok({ ok: true, message: "Подключение к OpenRouter работает" });
  } catch (err) {
    if (err instanceof OpenRouterError) return badRequest(err.message);
    return badRequest("Не удалось подключиться к OpenRouter");
  }
}
