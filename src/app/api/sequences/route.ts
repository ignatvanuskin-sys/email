import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  triggerType: z.string().trim().min(1).max(120).optional().default("Manual"),
  preset: z.enum(["Welcome", "AbandonedCart", "Reactivation"]).optional(),
});

const PRESETS = {
  Welcome: { name: "Welcome journey", triggerType: "contact.created", steps: [
    { delayDays: 0, subject: "Welcome, {{firstName}}", body: "Hi {{firstName}},\n\nWelcome! Here is everything you need to get started." },
    { delayDays: 2, subject: "How is it going?", body: "Hi {{firstName}},\n\nHave you had a chance to get started? Reply if you need help." },
  ] },
  AbandonedCart: { name: "Abandoned cart", triggerType: "cart.abandoned", steps: [
    { delayDays: 0, subject: "You left something behind", body: "Hi {{firstName}},\n\nYour cart is waiting for you. Complete your order when you are ready." },
    { delayDays: 1, subject: "Still interested?", body: "Hi {{firstName}},\n\nA quick reminder that the items in your cart may still be available." },
  ] },
  Reactivation: { name: "Reactivation", triggerType: "contact.inactive", steps: [
    { delayDays: 0, subject: "We have missed you", body: "Hi {{firstName}},\n\nIt has been a while. Here is what is new." },
    { delayDays: 7, subject: "Should we stay in touch?", body: "Hi {{firstName}},\n\nWould you still like to hear from us?" },
  ] },
} as const;

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
    const preset = d.preset ? PRESETS[d.preset] : null;
    const sequence = await prisma.sequence.create({
      data: { userId: user.id, name: preset?.name ?? d.name, triggerType: preset?.triggerType ?? d.triggerType, preset: d.preset ?? null, steps: preset ? { create: preset.steps.map((step, position) => ({ ...step, position })) } : undefined },
      include: { steps: true },
    });
    return ok({ sequence }, 201);
  } catch (err) {
    return handleError(err);
  }
}
