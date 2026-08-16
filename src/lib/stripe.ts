import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeLikeSignature(raw: string, signature: string | null, secret: string): boolean { if (!signature) return false; const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2))); if (!parts.t || !parts.v1) return false; const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex"); const actual = parts.v1; return expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual)); }
