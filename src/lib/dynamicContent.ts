import type { TemplateVars } from "./emailSender";

export type DynamicRule = { field: string; operator: "equals" | "not_equals" | "contains" | "exists"; value?: string };
export type DynamicBlock = { when: DynamicRule[]; content: string };
export type DynamicDocument = { blocks: DynamicBlock[]; fallback: string };

function fieldValue(vars: TemplateVars, field: string): string {
  const value = vars[field];
  return value === undefined || value === null ? "" : String(value);
}

function matches(rule: DynamicRule, vars: TemplateVars): boolean {
  const actual = fieldValue(vars, rule.field).toLowerCase();
  const expected = String(rule.value ?? "").toLowerCase();
  if (rule.operator === "exists") return actual.length > 0;
  if (rule.operator === "equals") return actual === expected;
  if (rule.operator === "not_equals") return actual !== expected;
  return actual.includes(expected);
}

export function isDynamicDocument(value: unknown): value is DynamicDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<DynamicDocument>;
  return Array.isArray(document.blocks) && typeof document.fallback === "string";
}

export function renderDynamicContent(document: DynamicDocument, vars: TemplateVars): string {
  const block = document.blocks.find((candidate) => candidate.when.length > 0 && candidate.when.every((rule) => matches(rule, vars)));
  return block?.content ?? document.fallback;
}

export function parseDynamicContent(text: string): DynamicDocument | null {
  const marker = text.match(/^\s*<!--\s*clipreach-dynamic:([\s\S]+?)\s*-->\s*$/i);
  if (!marker) return null;
  try {
    const parsed = JSON.parse(marker[1]) as unknown;
    return isDynamicDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function renderContent(text: string, vars: TemplateVars): string {
  const document = parseDynamicContent(text);
  return document ? renderDynamicContent(document, vars) : text;
}
