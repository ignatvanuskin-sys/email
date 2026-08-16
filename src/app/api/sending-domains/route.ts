import { prisma } from "@/lib/prisma";
import { badRequest, getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { domainDnsRecords, generateDkimKeyPair, normalizeDomain, normalizeSelector } from "@/lib/deliverability";
import { encryptCredentials } from "@/lib/crypto";
import { z } from "zod";

const createSchema = z.object({
  domain: z.string().trim().min(1).max(253),
  selector: z.string().trim().min(1).max(63).optional().default("clipreach"),
});

function present(domain: {
  id: string; domain: string; selector: string; dkimPublicKey: string;
  spfStatus: string; dkimStatus: string; dmarcStatus: string; overallStatus: string;
  spfValue: string | null; dmarcValue: string | null; lastError: string | null;
  lastCheckedAt: Date | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    ...domain,
    records: domainDnsRecords(domain.domain, domain.selector, domain.dkimPublicKey),
    lastCheckedAt: domain.lastCheckedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
    dkimPublicKey: undefined,
  };
}

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const domains = await prisma.sendingDomain.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return ok({ domains: domains.map(present) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const data = createSchema.parse(await readJson(req));
    const domain = normalizeDomain(data.domain);
    const selector = normalizeSelector(data.selector);
    const existing = await prisma.sendingDomain.findUnique({ where: { userId_domain: { userId: user.id, domain } } });
    if (existing) return badRequest("This domain is already configured");
    const keys = generateDkimKeyPair();
    const created = await prisma.sendingDomain.create({
      data: {
        userId: user.id,
        domain,
        selector,
        dkimPublicKey: keys.publicKey,
        dkimPrivateKeyEncrypted: encryptCredentials(keys.privateKey),
      },
    });
    return ok({ domain: present(created) }, 201);
  } catch (error) {
    return handleError(error);
  }
}
