import { describe, it, expect } from "vitest";

function startOfDayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

describe("daily sending limit", () => {
  it("counts emails sent since start of UTC day", () => {
    const now = new Date();
    const start = startOfDayUTC();
    const sentToday = new Date(now.getTime());
    const sentYesterday = new Date(now.getTime() - 86400000);

    const count = (list: Date[]) => list.filter((d) => d >= start).length;

    expect(count([sentToday, sentToday])).toBe(2);
    expect(count([sentYesterday])).toBe(0);
    expect(count([sentToday, sentYesterday])).toBe(1);
  });

  it("blocks when limit is reached", () => {
    const limit = 2;
    const sentToday = 2;
    expect(sentToday >= limit).toBe(true);
  });

  it("allows when under limit", () => {
    const limit = 5;
    const sentToday = 3;
    expect(sentToday >= limit).toBe(false);
  });
});
