import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { handleError, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "auth-login", 10, 15 * 60 * 1000);
  if (limited) return limited;
  try {
    const body = await readJson(req);
    const parsed = loginSchema.parse(body);
    const email = parsed.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(parsed.password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    await createSession({ userId: user.id, email: user.email, name: user.name });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessDescription: user.businessDescription,
        timezone: user.timezone,
        outreachPaused: user.outreachPaused,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}