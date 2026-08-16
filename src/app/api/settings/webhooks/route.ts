import { prisma } from "@/lib/prisma";
import { encryptCredentials } from "@/lib/crypto";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ensureWorkspace, roleCan } from "@/lib/workspace";

const schema = z.object({ url: z.string().url().max(2000), events: z.array(z.string()).min(1).default(["event.received"]) });

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const workspace = await ensureWorkspace(user); const membership = workspace.memberships.find((item) => item.userId === user.id); if (!membership || !roleCan(membership.role, "Admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return ok({ endpoints: endpoints.map((endpoint) => ({ id: endpoint.id, url: endpoint.url, events: endpoint.events.split(","), isActive: endpoint.isActive, createdAt: endpoint.createdAt.toISOString() })) });
  } catch (error) { return handleError(error); }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const workspace = await ensureWorkspace(user); const membership = workspace.memberships.find((item) => item.userId === user.id); if (!membership || !roleCan(membership.role, "Admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const data = schema.parse(await readJson(req));
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const endpoint = await prisma.webhookEndpoint.create({ data: { userId: user.id, url: data.url, events: data.events.join(","), secretEncrypted: encryptCredentials(secret) } });
    return ok({ secret, endpoint: { id: endpoint.id, url: endpoint.url, events: data.events, isActive: endpoint.isActive, createdAt: endpoint.createdAt.toISOString() } }, 201);
  } catch (error) { return handleError(error); }
}

export async function DELETE(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return badRequest("id is required");
    await prisma.webhookEndpoint.deleteMany({ where: { id, userId: user.id } });
    return ok({ deleted: true });
  } catch (error) { return handleError(error); }
}
