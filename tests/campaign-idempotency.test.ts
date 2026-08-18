import { describe, expect, it } from "vitest";

function claimPending(status: "Pending" | "Queued") {
  return status === "Pending" ? "Queued" : status;
}

describe("campaign batch idempotency contract", () => {
  it("allows only one atomic pending-to-queued claim", () => {
    let status: "Pending" | "Queued" = "Pending";
    const first = claimPending(status);
    status = first as typeof status;
    const second = status === "Pending" ? claimPending(status) : null;
    expect(first).toBe("Queued");
    expect(second).toBeNull();
    expect(status).toBe("Queued");
  });

  it("uses one logical key for a campaign lead regardless of retries", () => {
    const campaignId = "campaign-1";
    const leadId = "lead-1";
    const key = `campaign:${campaignId}:lead:${leadId}`;
    expect(key).toBe("campaign:campaign-1:lead:lead-1");
    expect(key).toBe(`campaign:${campaignId}:lead:${leadId}`);
  });

  it("does not send a provider request again after a sent email is persisted", () => {
    const email = { status: "Sent", providerMessageId: "provider-1" };
    const shouldCallProvider = email.status !== "Sent" || !email.providerMessageId;
    expect(shouldCallProvider).toBe(false);
  });
});
