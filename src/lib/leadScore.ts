import { SCORE_TIERS } from "./status";

export type ScoreFactorKey =
  | "contentActivity"
  | "shortFormGap"
  | "audienceSize"
  | "growthSignal"
  | "contactability"
  | "commercialPotential";

export type ScoreBreakdown = Array<{
  key: ScoreFactorKey;
  label: string;
  points: number; // 0-100 raw
  weight: number; // e.g. 20
  weighted: number; // points * weight / 100
  reason: string;
}>;

export type ScoreInput = {
  email: string | null | undefined;
  followersCount: number | null | undefined;
  contentActivity: number; // 0-100
  longFormCount: number;
  shortFormCount: number;
  growthSignal: number; // 0-100
  commercialPotential: number; // 0-100
};

const FACTORS: Array<{ key: ScoreFactorKey; label: string; weight: number }> = [
  { key: "contentActivity", label: "Content Activity", weight: 20 },
  { key: "shortFormGap", label: "Short-form Gap", weight: 25 },
  { key: "audienceSize", label: "Audience Size", weight: 15 },
  { key: "growthSignal", label: "Growth Signal", weight: 15 },
  { key: "contactability", label: "Contactability", weight: 10 },
  { key: "commercialPotential", label: "Commercial Potential", weight: 15 },
];

// Audience sweet spot (spec §15): too small = low value, huge = low reply odds.
function audiencePoints(followers: number | null | undefined): number {
  if (followers == null || followers <= 0) return 0;
  if (followers < 1000) return 20;
  if (followers < 10_000) return 60;
  if (followers < 100_000) return 100;
  if (followers < 1_000_000) return 75;
  return 45;
}

// Central "needs this service" signal: plenty of long-form, almost no Shorts.
function shortFormGapPoints(longForm: number, shortForm: number): number {
  if (longForm <= 0) return 10; // no long-form content to repurpose
  if (shortForm <= 0) return 95; // long-form but zero shorts => ideal prospect
  const total = longForm + shortForm;
  const ratio = shortForm / total; // 0..1
  // more shorts => smaller gap
  return Math.max(0, Math.round(95 - ratio * 85));
}

export function computeScore(input: ScoreInput): {
  score: number;
  breakdown: ScoreBreakdown;
} {
  const factors: Array<{ key: ScoreFactorKey; points: number; reason: string }> = [
    {
      key: "contentActivity",
      points: clamp(input.contentActivity),
      reason:
        input.contentActivity >= 70
          ? "Frequent publishing — active channel."
          : input.contentActivity >= 40
            ? "Moderate publishing cadence."
            : "Low/inconsistent publishing activity.",
    },
    {
      key: "shortFormGap",
      points: shortFormGapPoints(input.longFormCount, input.shortFormCount),
      reason:
        input.shortFormCount > 0
          ? `${input.shortFormCount} short-form pieces vs ${input.longFormCount} long-form — existing gap to close.`
          : `No short-form at all behind ${input.longFormCount} long-form pieces — strong "needs the service" signal.`,
    },
    {
      key: "audienceSize",
      points: audiencePoints(input.followersCount),
      reason: audienceReason(input.followersCount),
    },
    {
      key: "growthSignal",
      points: clamp(input.growthSignal),
      reason:
        input.growthSignal >= 70
          ? "Visible growth trajectory."
          : input.growthSignal >= 40
            ? "Steady growth signals."
            : "No strong growth signal detected.",
    },
    {
      key: "contactability",
      points: input.email ? 100 : 0,
      reason: input.email
        ? "Contact email is available — can execute outreach."
        : "No contact email — cannot reach out. Caps score to WARM.",
    },
    {
      key: "commercialPotential",
      points: clamp(input.commercialPotential),
      reason:
        input.commercialPotential >= 70
          ? "Commercial niche — high likelihood of paid work."
          : input.commercialPotential >= 40
            ? "Some commercial motivation."
            : "Mostly hobby/creative niche, lower willingness to pay.",
    },
  ];

  const breakdown: ScoreBreakdown = factors.map((f) => {
    const meta = FACTORS.find((m) => m.key === f.key)!;
    return {
      key: f.key,
      label: meta.label,
      points: f.points,
      weight: meta.weight,
      weighted: f.points * (meta.weight / 100),
      reason: f.reason,
    };
  });

  let score = Math.round(breakdown.reduce((sum, f) => sum + f.weighted, 0));

  // Contactability hard cap (spec §15): without email, max = WARM.
  const contact = breakdown.find((f) => f.key === "contactability")!;
  if (contact.points === 0) score = Math.min(score, SCORE_TIERS.WARM.min - 1);

  return { score: clamp(score), breakdown };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function audienceReason(followers: number | null | undefined): string {
  if (followers == null || followers <= 0) return "Unknown audience size.";
  if (followers < 1000) return "Under 1k followers — small commercial value.";
  if (followers < 10_000) return "Tens of thousands — accessible, decent value.";
  if (followers < 100_000) return "Strong audience in the ideal outreach range.";
  if (followers < 1_000_000) return "Large audience — high value but colder outreach.";
  return "Very large channel — low odds of replying to cold email.";
}