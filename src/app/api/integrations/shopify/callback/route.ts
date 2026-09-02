import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api";
import { env } from "@/lib/env";
import { consumeOAuthState } from "@/lib/oauthState";
import { encryptCredentials } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";

const SHOP_DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i;

export async function GET(req: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.redirect(`${env.APP_URL}/login`);
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const shop = (url.searchParams.get("shop") ?? "").trim().toLowerCase();
  if (!SHOP_DOMAIN.test(shop)) return NextResponse.json({ error: "Invalid Shopify shop domain", code: "SHOPIFY_INVALID_HOST" }, { status: 400 });
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) return NextResponse.json({ error: "Shopify integration is not configured", code: "SHOPIFY_NOT_CONFIGURED" }, { status: 503 });

  const stateRecord = await consumeOAuthState(state, "shopify");
  if (!stateRecord || !code) return NextResponse.json({ error: "Invalid or expired Shopify OAuth state", code: "OAUTH_STATE_INVALID" }, { status: 400 });

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, code }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Shopify token exchange timed out", code: "SHOPIFY_TIMEOUT" }, { status: 504 });
  }
  if (!tokenResponse.ok) return NextResponse.json({ error: "Shopify token exchange failed", code: "SHOPIFY_TOKEN_EXCHANGE_FAILED" }, { status: 502 });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return NextResponse.json({ error: "Shopify did not return an access token", code: "SHOPIFY_TOKEN_MISSING" }, { status: 502 });

  const publicToken = `int_${randomBytes(18).toString("base64url")}`;
  await prisma.integrationConnection.upsert({
    where: { userId_provider_name: { userId: user.id, provider: "shopify", name: shop } },
    create: { userId: user.id, provider: "shopify", name: shop, publicToken, secretEncrypted: encryptCredentials(token.access_token) },
    update: { secretEncrypted: encryptCredentials(token.access_token), status: "Connected", lastError: null },
  });
  return NextResponse.redirect(`${env.APP_URL}/settings`);
}
