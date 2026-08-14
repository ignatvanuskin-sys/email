import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().trim().max(100).optional().default("Custom"),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().trim().min(1, "Body is required").max(50000),
});

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const templates = await prisma.emailTemplate.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return ok({ templates });
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
    const template = await prisma.emailTemplate.create({
      data: { userId: user.id, name: d.name, category: d.category, subject: d.subject, body: d.body },
    });
    return ok({ template }, 201);
  } catch (err) {
    return handleError(err);
  }
}