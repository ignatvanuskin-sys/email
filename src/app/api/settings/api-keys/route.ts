import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { generateApiKey } from "@/lib/apiKeys";
import { z } from "zod";
import { ensureWorkspace, roleCan } from "@/lib/workspace";

const schema = z.object({ name: z.string().trim().min(1).max(120), scopes: z.array(z.string()).min(1).default(["contacts:write", "events:write"]) });

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const workspace = await ensureWorkspace(user); const membership = workspace.memberships.find((item) => item.userId === user.id); if (!membership || !roleCan(membership.role, "Admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const keys = await prisma.apiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return ok({ keys: keys.map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, scopes: key.scopes.split(","), lastUsedAt: key.lastUsedAt?.toISOString() ?? null, createdAt: key.createdAt.toISOString() })) });
  } catch (error) { return handleError(error); }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const workspace = await ensureWorkspace(user); const membership = workspace.memberships.find((item) => item.userId === user.id); if (!membership || !roleCan(membership.role, "Admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    const data = schema.parse(await readJson(req));
    const generated = generateApiKey();
    const record = await prisma.apiKey.create({ data: { userId: user.id, name: data.name, prefix: generated.prefix, keyHash: generated.hash, scopes: data.scopes.join(",") } });
    return ok({ key: generated.key, apiKey: { id: record.id, name: record.name, prefix: record.prefix, scopes: data.scopes, createdAt: record.createdAt.toISOString() } }, 201);
  } catch (error) { return handleError(error); }
}

export async function DELETE(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return badRequest("id is required");
    await prisma.apiKey.deleteMany({ where: { id, userId: user.id } });
    return ok({ deleted: true });
  } catch (error) { return handleError(error); }
}
