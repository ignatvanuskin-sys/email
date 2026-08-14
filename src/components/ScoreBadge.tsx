"use client";

// Visual score indicator with a hover explainable tooltip (spec §15).
export function scoreTier(score: number): "HOT" | "WARM" | "COLD" {
  if (score >= 80) return "HOT";
  if (score >= 50) return "WARM";
  return "COLD";
}

const EMOJI: Record<string, string> = { HOT: "🔥", WARM: "🟡", COLD: "⚪" };

export function ScoreBadge({
  score,
  breakdown,
}: {
  score: number;
  breakdown?: Array<{ key: string; label: string; points: number; weight: number; reason: string }> | null;
}) {
  const tier = scoreTier(score);
  return (
    <span
      className={`badge ${tier.toLowerCase()}`}
      title={breakdown?.map((b) => `${b.label}: ${b.points}/100 (${b.weight}%) — ${b.reason}`).join("\n")}
    >
      {EMOJI[tier]} {score} {tier}
    </span>
  );
}