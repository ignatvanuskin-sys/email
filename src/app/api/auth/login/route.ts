import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { handleError, readJson } from "@/lib/api";

export async function POST(req: Request) {
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