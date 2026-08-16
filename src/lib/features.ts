import { env } from "./env";

export const FEATURES = {
  telegram: env.ENABLE_TELEGRAM,
  shopify: env.ENABLE_SHOPIFY,
  advancedJourneys: env.ENABLE_ADVANCED_JOURNEYS,
  billing: env.ENABLE_BILLING,
  htmlBuilder: env.ENABLE_HTML_BUILDER,
} as const;

export type FeatureName = keyof typeof FEATURES;
export function featureEnabled(feature: FeatureName): boolean { return FEATURES[feature]; }
