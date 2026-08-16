import { NextResponse } from "next/server";
import { productionEnvIssues } from "@/lib/productionEnv";

export const dynamic = "force-dynamic";

export function GET() {
  const issues = productionEnvIssues();
  return NextResponse.json({ status: issues.length ? "degraded" : "ok", checks: { config: issues.length ? "failed" : "ok" }, issues }, { status: issues.length ? 503 : 200 });
}
