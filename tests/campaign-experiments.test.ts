import { describe, expect, it } from "vitest";
import { assignVariant } from "../src/lib/campaignExperiments";
import { computeCampaignApprovalHash, isCampaignApprovalValid } from "../src/lib/approval";

describe("campaign experiments", () => {
  it("keeps assignment stable for a contact", () => {
    const variants = [{ id: "a", weight: 50 }, { id: "b", weight: 50 }];
    expect(assignVariant("campaign:lead-1", variants)).toBe(assignVariant("campaign:lead-1", variants));
    expect(assignVariant("campaign:lead-1", [{ id: "a", weight: 0 }, { id: "b", weight: 100 }])).toBe("b");
  });

  it("returns null when all variants have zero weight", () => {
    expect(assignVariant("seed", [{ id: "a", weight: 0 }])).toBeNull();
  });
});

describe("campaign approval", () => {
  it("binds approval to campaign version content hash", () => {
    const hash = computeCampaignApprovalHash("campaign", "version-1", "content-a");
    expect(isCampaignApprovalValid("campaign", "version-1", "content-a", hash, new Date(Date.now() + 60_000))).toBe(true);
    expect(isCampaignApprovalValid("campaign", "version-2", "content-a", hash, new Date(Date.now() + 60_000))).toBe(false);
    expect(isCampaignApprovalValid("campaign", "version-1", "content-b", hash, new Date(Date.now() + 60_000))).toBe(false);
  });
});
