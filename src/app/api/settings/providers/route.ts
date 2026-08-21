import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, notFound, badRequest } from "@/lib/api";
import { providerConnectSchema, smtpConfigSchema } from "@/lib/validation";
import { decryptCredentials, encryptCredentials } from "@/lib/crypto";

function safeConfig(encrypted: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(decryptCredentials(encrypted)) as Record<string, unknown>;
    return {
      host: typeof parsed.host === "string" ? parsed.host : undefined,
      port: typeof parsed.port === "number" ? parsed.port : undefined,
      user: typeof parsed.user === "string" ? parsed.user : undefined,
      from: typeof parsed.from === "string" ? parsed.from : undefined,
      secure: typeof parsed.secure === "boolean" ? parsed.secure : undefined,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
    };
  } catch {
    return {};
  }
}

function safePlatform(encrypted: string): string | undefined {
  try {
    const parsed = JSON.parse(decryptCredentials(encrypted)) as Record<string, unknown>;
    return typeof parsed.platform === "string" ? parsed.platform : undefined;
  } catch {
    return undefined;
  }
}

function safeProviderConfig(encrypted: string) {
  return safeConfig(encrypted);
}

export async function GET(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? parseCursor(cursorValue) : null;
    if (cursorValue && !cursor) return badRequest("Invalid cursor");
    const providers = await prisma.provider.findMany({
      where: { userId: user.id, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = providers.length > limit;
    const visible = hasMore ? providers.slice(0, limit) : providers;
    const last = visible.at(-1);
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return ok({
      providers: visible.map((p) => ({
        id: p.id,
        kind: p.kind,
        platform: safePlatform(p.configEncrypted),
        isActive: p.isActive,
        dailyLimit: p.dailyLimit,
        configured: Boolean(p.configEncrypted),
        safeConfig: safeProviderConfig(p.configEncrypted),
        createdAt: p.createdAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    });
  } catch (err) {
    return handleError(err);
  }
}

function parseLimit(value: string | null): number { const parsed = Number(value ?? 50); return Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 50; }
function encodeCursor(cursor: { createdAt: string; id: string }): string { return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url"); }
function parseCursor(value: string): { createdAt: Date; id: string } | null { try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown }; if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string" || !parsed.id) return null; const createdAt = new Date(parsed.createdAt); return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: parsed.id }; } catch { return null; } }

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = providerConnectSchema.parse(body);

    const kind = d.type;
    console.info("[providers] POST", { userId: user.id, kind });
    const incoming: Record<string, unknown> = JSON.parse(d.config || "{}");
    const current = await prisma.provider.findFirst({
      where: { userId: user.id, kind: d.type },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    // Secret fields are write-only. An update with an empty secret preserves
    // the existing encrypted value instead of replacing it with blank data.
    const config: Record<string, unknown> = { ...incoming, platform: d.platform };
    if (current) {
      const previous = safeConfig(current.configEncrypted);
      let previousFull: Record<string, unknown> = {};
      try { previousFull = JSON.parse(decryptCredentials(current.configEncrypted)) as Record<string, unknown>; } catch { /* handled below */ }
      for (const secret of ["pass", "apiKey"]) {
        if (!config[secret] && previousFull[secret]) config[secret] = previousFull[secret];
      }
      // Never replace a saved model with an empty model during a metadata-only update.
      if (!config.model && previous.model) config.model = previous.model;
    }
    if (d.platform === "SMTP") {
      const smtp = smtpConfigSchema.parse(config);
      Object.assign(config, smtp);
    }

    // Provider settings are an upsert per account and kind. This preserves the
    // stable provider row instead of creating an inactive historical row on
    // every save, while still ensuring only one active provider exists.
    const existing = await prisma.provider.findFirst({
      where: { userId: user.id, kind },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    const provider = existing
      ? await prisma.$transaction(async (tx) => {
          await tx.provider.updateMany({
            where: { userId: user.id, kind, isActive: true, NOT: { id: existing.id } },
            data: { isActive: false },
          });
          return tx.provider.update({
            where: { id: existing.id },
            data: {
              configEncrypted: encryptCredentials(JSON.stringify(config)),
              isActive: true,
              dailyLimit: d.dailyLimit,
            },
          });
        })
      : await prisma.provider.create({
          data: {
            userId: user.id,
            kind,
            configEncrypted: encryptCredentials(JSON.stringify(config)),
            isActive: true,
            dailyLimit: d.dailyLimit,
          },
        });

    console.info("[providers] SAVED", { userId: user.id, providerId: provider.id, kind: provider.kind, isActive: provider.isActive });
    return ok({ provider: { id: provider.id, kind: provider.kind, isActive: provider.isActive } }, existing ? 200 : 201);
  } catch (err) {
    if (err instanceof SyntaxError) return badRequest("config must be valid JSON");
    return handleError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const id = (body as { id?: string }).id;
    const isActive = (body as { isActive?: boolean }).isActive;
    if (!id) return badRequest("id is required");

    const provider = await prisma.provider.findFirst({ where: { id, userId: user.id } });
    if (!provider) return notFound("Provider not found");

    if (isActive === true) {
      await prisma.provider.updateMany({ where: { userId: user.id, kind: provider.kind, isActive: true }, data: { isActive: false } });
    }
    const updated = await prisma.provider.update({ where: { id }, data: { isActive: isActive === true } });
    return ok({ provider: { id: updated.id, isActive: updated.isActive } });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return badRequest("id is required");
    await prisma.provider.deleteMany({ where: { id, userId: user.id } });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}