import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api";
import { env } from "@/lib/env";
import { decryptCredentials } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ integration: string }> }) { const user = await getApiUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { integration: integrationId } = await params; const integration = await prisma.integrationConnection.findFirst({ where: { id: integrationId, userId: user.id, provider: "shopify" } }); if (!integration) return NextResponse.json({ error: "Shopify integration not found" }, { status: 404 }); try { const token = decryptCredentials(integration.secretEncrypted); const topics = ["checkouts/update", "orders/paid", "products/viewed"]; const results = []; for (const topic of topics) { const response = await fetch(`https://${integration.name}/admin/api/2024-10/webhooks.json`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": token }, body: JSON.stringify({ webhook: { topic, address: `${env.APP_URL}/api/integrations/${integration.publicToken}/events`, format: "json" } }) }); results.push({ topic, ok: response.ok, status: response.status }); } const failed = results.some((result) => !result.ok); await prisma.integrationConnection.update({ where: { id: integrationId }, data: { status: failed ? "NeedsAttention" : "Connected", lastError: failed ? "One or more Shopify webhooks could not be registered" : null } }); return NextResponse.json({ ok: !failed, results }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Shopify webhook registration failed" }, { status: 502 }); } }



