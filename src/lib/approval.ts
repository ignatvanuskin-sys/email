import { createHmac } from "node:crypto";
import { env } from "./env";

// Approval hash ties a specific subject+body to an intent-to-send (spec §14.3).
// Resending is only allowed if content is exactly what the user approved.
export function computeApprovalHash(emailId: string, subject: string, body: string): string {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${emailId}\u0000${subject}\u0000${body}`)
    .digest("base64url");
}

export const APPROVAL_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function isApprovalValid(
  emailId: string,
  subject: string,
  body: string,
  approvalHash: string | null,
  approvalExpiresAt: Date | null,
): boolean {
  if (!approvalHash || !approvalExpiresAt) return false;
  if (new Date(approvalExpiresAt).getTime() < Date.now()) return false;
  return computeApprovalHash(emailId, subject, body) === approvalHash;
}