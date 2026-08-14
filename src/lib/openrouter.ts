export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_TIMEOUT_MS = 20_000;

export type OpenRouterModel = {
  id: string;
  name: string;
  provider: string;
  contextLength: number | null;
  isFree: boolean;
  status: "available" | "unknown";
};

// Maintained fallback IDs published by OpenRouter. Discovery remains the primary source.
export const OPENROUTER_FREE_FALLBACK: OpenRouterModel[] = [
  {
    id: "openrouter/free",
    name: "OpenRouter Free",
    provider: "OpenRouter",
    contextLength: null,
    isFree: true,
    status: "unknown",
  },
];

type RawModel = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
};

export function isFreeOpenRouterModel(model: Pick<OpenRouterModel, "id" | "isFree">): boolean {
  return model.isFree || model.id.endsWith(":free") || model.id === "openrouter/free";
}

export function normalizeOpenRouterModels(payload: unknown): OpenRouterModel[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("OpenRouter вернул некорректный список моделей");
  }
  return ((payload as { data: RawModel[] }).data)
    .filter((item): item is RawModel & { id: string } => typeof item?.id === "string" && item.id.length > 0)
    .map((item) => {
      const prompt = Number(item.pricing?.prompt);
      const completion = Number(item.pricing?.completion);
      const idFree = item.id.endsWith(":free") || item.id === "openrouter/free";
      const priceFree = Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
      return {
        id: item.id,
        name: typeof item.name === "string" && item.name ? item.name : item.id,
        provider: item.id.includes("/") ? item.id.split("/")[0] : "OpenRouter",
        contextLength: Number.isFinite(Number(item.context_length)) ? Number(item.context_length) : null,
        isFree: idFree || priceFree,
        status: "available" as const,
      };
    });
}

export function filterOpenRouterModels(models: OpenRouterModel[], freeOnly: boolean): OpenRouterModel[] {
  return freeOnly ? models.filter(isFreeOpenRouterModel) : models;
}

export class OpenRouterError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
  }
}

export async function openRouterRequest(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  try {
    const response = await fetcher(`${OPENROUTER_API_URL}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
        "X-Title": "ClipReach",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new OpenRouterError("Неверный API-ключ OpenRouter", 401);
      if (response.status === 429) throw new OpenRouterError("Лимит запросов OpenRouter исчерпан. Повторите позже", 429);
      if (response.status >= 500) throw new OpenRouterError("OpenRouter временно недоступен", 503);
      throw new OpenRouterError(`OpenRouter отклонил запрос (${response.status})`, response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new OpenRouterError("OpenRouter вернул некорректный ответ");
    }
  } catch (error) {
    if (error instanceof OpenRouterError) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new OpenRouterError("Превышено время ожидания ответа OpenRouter", 504);
    }
    throw new OpenRouterError("Не удалось подключиться к OpenRouter", 503);
  }
}

export async function discoverOpenRouterModels(fetcher: typeof fetch = fetch): Promise<{ models: OpenRouterModel[]; fallback: boolean }> {
  try {
    const payload = await openRouterRequest("/models", { method: "GET" }, fetcher);
    const models = normalizeOpenRouterModels(payload);
    if (!models.length) throw new Error("empty");
    return { models, fallback: false };
  } catch {
    return { models: OPENROUTER_FREE_FALLBACK, fallback: true };
  }
}

export async function chatOpenRouter(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const payload = await openRouterRequest("/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  }, fetcher) as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new OpenRouterError("OpenRouter вернул некорректный ответ");
  return content;
}
