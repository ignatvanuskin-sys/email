import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, notFound, badRequest } from "@/lib/api";
import { providerConnectSchema } from "@/lib/validation";
import { decryptCredentials, encryptCredentials } from "@/lib/crypto";

function safeConfig(encrypted: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(decryptCredentials(encrypted)) as Record<string, unknown>;
    return {
      host: typeof parsed.host === "string" ? parsed.host : undefined,
      port: typeof parsed.port === "number" ? parsed.port : undefined,
      user: typeof parsed.user === "string" ? parsed.user : undefined,
      from: typeof parsed.from === "string" ? parsed.from : undefined,
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

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    console.info("[providers] GET", { userId: user.id, databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db" });
    const providers = await prisma.provider.findMany({
      where: { userId: user.id },
      orderBy: [{ kind: "asc" }, { isActive: "desc" }, { createdAt: "desc" }],
    });
    // The API intentionally returns metadata only. The database remains the
    // source of truth; credentials are never sent to the browser.
    return ok({
      providers: providers.map((p) => ({
        id: p.id,
        kind: p.kind,
        platform: safePlatform(p.configEncrypted),
        isActive: p.isActive,
        dailyLimit: p.dailyLimit,
        configured: Boolean(p.configEncrypted),
        safeConfig: safeProviderConfig(p.configEncrypted),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

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