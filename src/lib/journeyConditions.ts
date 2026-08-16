export type JourneyCondition = { field: string; operator: "equals" | "not_equals" | "contains" | "exists"; value?: string };

export function evaluateJourneyConditions(raw: string | null | undefined, context: Record<string, unknown>): boolean {
  if (!raw) return true;
  try {
    const parsed = JSON.parse(raw) as JourneyCondition[];
    if (!Array.isArray(parsed) || parsed.length === 0) return true;
    return parsed.every((condition) => {
      const actual = context[condition.field];
      const left = actual == null ? "" : String(actual).toLowerCase();
      const right = String(condition.value ?? "").toLowerCase();
      if (condition.operator === "exists") return left.length > 0;
      if (condition.operator === "equals") return left === right;
      if (condition.operator === "not_equals") return left !== right;
      return left.includes(right);
    });
  } catch { return false; }
}
