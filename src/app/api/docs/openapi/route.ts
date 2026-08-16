import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ openapi: "3.0.3", info: { title: "ClipReach API", version: "1.0.0" }, servers: [{ url: "/api" }], paths: { "/v1/contacts": { post: { summary: "Create or update a contact", security: [{ bearerAuth: [] }] } }, "/v1/events": { post: { summary: "Ingest an event and trigger journeys", security: [{ bearerAuth: [] }] } }, "/settings/webhooks": { post: { summary: "Create an outbound webhook", security: [] } } }, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } } }, { headers: { "cache-control": "public, max-age=300" } });
}
