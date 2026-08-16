import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { domainDnsRecords, verifyDomainDns } from "@/lib/deliverability";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const domain = await prisma.sendingDomain.findFirst({ where: { id, userId: user.id } });
    if (!domain) return notFound("Sending domain not found");
    const result = await verifyDomainDns(domain.domain, domain.selector, domain.dkimPublicKey);
    const updated = await prisma.sendingDomain.update({
      where: { id: domain.id },
      data: { ...result, lastCheckedAt: new Date() },
    });
    return ok({
      domain: {
        id: updated.id,
        domain: updated.domain,
        selector: updated.selector,
        spfStatus: updated.spfStatus,
        dkimStatus: updated.dkimStatus,
        dmarcStatus: updated.dmarcStatus,
        overallStatus: updated.overallStatus,
        spfValue: updated.spfValue,
        dmarcValue: updated.dmarcValue,
        lastError: updated.lastError,
        lastCheckedAt: updated.lastCheckedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        records: domainDnsRecords(updated.domain, updated.selector, updated.dkimPublicKey),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
