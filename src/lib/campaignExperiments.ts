import { createHash } from "node:crypto";

export type ExperimentVariant = { id: string; weight: number };

export function assignVariant(seed: string, variants: ExperimentVariant[]): string | null {
  const available = variants.filter((variant) => variant.weight > 0);
  const total = available.reduce((sum, variant) => sum + variant.weight, 0);
  if (!total) return null;
  const digest = createHash("sha256").update(seed).digest();
  const bucket = digest.readUInt32BE(0) % total;
  let cursor = 0;
  for (const variant of available) { cursor += variant.weight; if (bucket < cursor) return variant.id; }
  return available[available.length - 1].id;
}
