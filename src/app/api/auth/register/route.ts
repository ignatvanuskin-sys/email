import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { handleError, readJson } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const parsed = registerSchema.parse(body);
    const email = parsed.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await (await import("@/lib/auth")).hashPassword(parsed.password),
        name: parsed.name || null,
        businessDescription: parsed.businessDescription,
      },
    });

    await createSession({ userId: user.id, email: user.email, name: user.name });

    return NextResponse.json(
      { user: renderUser(user) },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}

function renderUser(u: {
  id: string;
  email: string;
  name: string | null;
  businessDescription: string;
  timezone: string;
  outreachPaused: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    businessDescription: u.businessDescription,
    timezone: u.timezone,
    outreachPaused: u.outreachPaused,
  };
}