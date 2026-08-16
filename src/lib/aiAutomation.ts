import { chat, type AiClient } from "./ai";

export type GeneratedAutomation = { conditions: Array<{ field: string; operator: "equals" | "not_equals" | "contains" | "exists"; value?: string }>; goalEventType: string | null; exitEventType: string | null };

export async function generateAutomation(client: AiClient, description: string): Promise<GeneratedAutomation> {
  const response = await chat(client, "You design safe email automation rules. Return ONLY JSON: {\"conditions\":[{\"field\":string,\"operator\":\"equals\"|\"not_equals\"|\"contains\"|\"exists\",\"value\":string?}],\"goalEventType\":string|null,\"exitEventType\":string|null}. Use simple profile/event fields. Never return code.", description);
  try { const parsed = JSON.parse(response) as Partial<GeneratedAutomation>; const conditions = Array.isArray(parsed.conditions) ? parsed.conditions.filter((condition) => condition && typeof condition.field === "string" && ["equals", "not_equals", "contains", "exists"].includes(condition.operator)).slice(0, 10) as GeneratedAutomation["conditions"] : []; return { conditions, goalEventType: typeof parsed.goalEventType === "string" ? parsed.goalEventType : null, exitEventType: typeof parsed.exitEventType === "string" ? parsed.exitEventType : null }; } catch { return { conditions: [], goalEventType: null, exitEventType: null }; }
}
