import { prisma } from "@/lib/prisma";
import { getApiUser, apiError, badRequest, ok, readJson, unauthorized } from "@/lib/api";
import { decryptCredentials } from "@/lib/crypto";
import { chatOpenRouter, OpenRouterError } from "@/lib/openrouter";
import { requestRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const limited = await requestRateLimit(req, "provider-test", 10, 10 * 60 * 1000);
  if (limited) return limited;
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
    if (err instanceof OpenRouterError) {
      console.warn("[openrouter-provider-rejected]");
      return apiError("OpenRouter connection was rejected", 502, "AI_PROVIDER_REJECTED");
    }
    console.error("[openrouter-provider-error]", { err });
    return apiError("Could not connect to OpenRouter", 502, "AI_PROVIDER_UNAVAILABLE");
  }
}
