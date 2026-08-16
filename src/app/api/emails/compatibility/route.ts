import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { checkEmailCompatibility } from "@/lib/emailCompatibility";

const schema = z.object({ html: z.string().max(250000) });
export async function POST(req: Request) { try { const user = await getApiUser(); if (!user) return unauthorized(); void user; const data = schema.parse(await readJson(req)); return ok({ issues: checkEmailCompatibility(data.html) }); } catch (error) { return handleError(error); } }
