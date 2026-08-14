import { getApiUser, ok, unauthorized } from "@/lib/api";

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();
  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      businessDescription: user.businessDescription,
      outreachPaused: user.outreachPaused,
    },
  });
}