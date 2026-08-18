import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "https://email-production-0ea1.up.railway.app";
  return {
    rules: { userAgent: "*", disallow: ["/api/", "/settings", "/leads", "/campaigns", "/templates", "/sequences", "/segments"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
