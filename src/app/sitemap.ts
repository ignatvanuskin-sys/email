import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "https://email-production-0ea1.up.railway.app";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/register`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
