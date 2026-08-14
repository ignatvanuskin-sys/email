import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(500).optional().default(""),
  filters: z.string().optional().default("[]"),
});

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const segments = await prisma.segment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return ok({ segments });
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
    const segment = await prisma.segment.create({
      data: { userId: user.id, name: d.name, description: d.description, filters: d.filters },
    });
    return ok({ segment }, 201);
  } catch (err) {
    return handleError(err);
  }
}