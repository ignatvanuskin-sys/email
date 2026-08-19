import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function verifyStripeLikeSignature(
  raw: string,
  signature: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (!signature || !secret) return false;
  const fields = signature.split(",").reduce<Record<string, string[]>>((result, part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return result;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    result[key] = [...(result[key] ?? []), value];
    return result;
  }, {});
  const timestamp = fields.t?.[0];
  const timestampSeconds = Number(timestamp);
  if (!timestamp || !Number.isInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return (fields.v1 ?? []).some((provided) => {
    if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
    const expectedBuffer = Buffer.from(expected, "hex");
    const providedBuffer = Buffer.from(provided, "hex");
    return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
  });
}
