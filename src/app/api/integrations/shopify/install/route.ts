import { NextResponse } from "next/server";
import { getApiUser, unauthorized } from "@/lib/api";
import { createOAuthState } from "@/lib/oauthState";
import { env } from "@/lib/env";

export async function GET(req: Request) { const user = await getApiUser(); if (!user) return unauthorized(); if (!env.SHOPIFY_CLIENT_ID) return NextResponse.json({ error: "SHOPIFY_CLIENT_ID is not configured" }, { status: 503 }); const shop = new URL(req.url).searchParams.get("shop") ?? ""; if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return NextResponse.json({ error: "Enter a valid Shopify shop domain" }, { status: 400 }); const state = await createOAuthState(user.id, "shopify", { shop }); const redirect = new URL(`https://${shop}/admin/oauth/authorize`); redirect.searchParams.set("client_id", env.SHOPIFY_CLIENT_ID); redirect.searchParams.set("scope", "read_customers,read_orders,read_products,read_checkouts"); redirect.searchParams.set("redirect_uri", `${env.APP_URL}/api/integrations/shopify/callback`); redirect.searchParams.set("state", state); return NextResponse.redirect(redirect); }
