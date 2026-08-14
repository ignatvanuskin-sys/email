import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const sequences = await prisma.sequence.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    return ok({ sequences });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = createSchema.parse(body);
    const sequence = await prisma.sequence.create({
      data: { userId: user.id, name: d.name },
      include: { steps: true },
    });
    return ok({ sequence }, 201);
  } catch (err) {
    return handleError(err);
  }
}