import { describe, expect, it } from "vitest";
import { parseSegmentFilters, segmentLeadWhere } from "../src/lib/segmentFilters";

describe("segment filters", () => {
  it("parses valid filters and ignores malformed input", () => {
    expect(parseSegmentFilters('[{"field":"status","value":"New"},{"field":"score","value":"80"}]')).toHaveLength(2);
    expect(parseSegmentFilters("broken")).toEqual([]);
  });

  it("builds tenant-scoped AND conditions", () => {
    expect(segmentLeadWhere("user-1", [{ field: "status", value: "New" }, { field: "score", value: "80" }])).toEqual({ userId: "user-1", AND: [{ status: "New" }, { leadScore: { gte: 80 } }] });
  });
});
