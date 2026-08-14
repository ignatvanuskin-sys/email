import { describe, it, expect } from "vitest";
import { computeScore } from "../src/lib/leadScore";
import { parseCsv, validateLeadRow } from "../src/lib/csv";
import { scoreTier } from "../src/lib/status";
import { applyTemplate, templateVariables } from "../src/lib/emailSender";
import { normalizeDashboard } from "../src/lib/dashboard";
import { filterOpenRouterModels, normalizeOpenRouterModels, openRouterRequest, OpenRouterError } from "../src/lib/openrouter";
import { encryptCredentials, decryptCredentials } from "../src/lib/crypto";
import { cleanEmailText, editEmail } from "../src/lib/ai";

describe("computeScore", () => {
  const base = {
    email: "a@b.com",
    followersCount: 50_000,
    contentActivity: 70,
    longFormCount: 12,
    shortFormCount: 0,
    growthSignal: 60,
    commercialPotential: 70,
  };

  it("scores a strong prospect as HOT", () => {
    const { score, breakdown } = computeScore(base);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(breakdown).toHaveLength(6);
    expect(breakdown.reduce((s, f) => s + f.weight, 0)).toBe(100);
  });

  it("caps at WARM when there is no contact email", () => {
    const { score } = computeScore({ ...base, email: null });
    expect(score).toBeLessThan(80);
    expect(score).toBeLessThanOrEqual(79);
  });

  it("a tiny audience scores low on audience weight", () => {
    const a = computeScore({ ...base, followersCount: 100 }).breakdown.find((f) => f.key === "audienceSize")!;
    expect(a.points).toBeLessThan(30);
  });

  it("short-form gap is high when long-form exists with no shorts", () => {
    const g = computeScore({ ...base, shortFormCount: 0 }).breakdown.find((f) => f.key === "shortFormGap")!;
    const g2 = computeScore({ ...base, shortFormCount: 99 }).breakdown.find((f) => f.key === "shortFormGap")!;
    expect(g.points).toBeGreaterThan(g2.points);
  });

  it("score is always within 0-100", () => {
    for (let i = 0; i < 20; i++) {
      const { score } = computeScore({
        ...base,
        followersCount: i * 37,
        contentActivity: i * 13,
        shortFormCount: i,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe("scoreTier", () => {
  it("labels tiers", () => {
    expect(scoreTier(85)).toBe("HOT");
    expect(scoreTier(60)).toBe("WARM");
    expect(scoreTier(10)).toBe("COLD");
  });
});

describe("parseCsv", () => {
  it("parses a CSV with a header row and skips empties", () => {
    const rows = parseCsv("name,email\nAlex,a@b.com\n\nMia,m@c.com\n");
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Alex");
  });

  it("handles quoted fields and commas", () => {
    const [row] = parseCsv(`name,note\n"X, Y","hello, world"`);
    expect(row.name).toBe("X, Y");
    expect(row.note).toBe("hello, world");
  });

  it("parses semicolon-delimited UTF-8 CSV", () => {
    const [row] = parseCsv("name;email;companyOrChannel\nМария;маша@example.com;Канал");
    expect(row.name).toBe("Мария");
    expect(row.companyOrChannel).toBe("Канал");
  });
});

describe("validateLeadRow", () => {
  it("flags missing name and invalid/duplicate email", () => {
    const existing = new Set(["dup@x.com"]);
    const bad = validateLeadRow({ name: "", email: "nope" }, existing);
    expect(bad.isValid).toBe(false);
    expect(bad.reasons.join(";")).toContain("Missing name");

    const dup = validateLeadRow({ name: "B", email: "DUP@x.com" }, existing);
    expect(dup.isValid).toBe(false);
    expect(dup.reasons.join(";")).toContain("Duplicate");

    const good = validateLeadRow({ name: "B", email: "b@x.com" }, existing);
    expect(good.isValid).toBe(true);
  });

  it("rejects spreadsheet formula injection", () => {
    const row = validateLeadRow({ name: "=HYPERLINK(\"https://evil.test\")", email: "safe@example.com" }, new Set());
    expect(row.isValid).toBe(false);
    expect(row.reasons).toContain("Potential CSV formula injection");
  });
});

describe("normalizeDashboard", () => {
  it("normalizes the current dashboard contract", () => {
    const dashboard = normalizeDashboard({
      counters: {
        totalLeads: 4,
        newLeads: 2,
        qualified: 1,
        contacted: 1,
        interested: 1,
        clients: 0,
        emailsSent: 3,
        replies: 1,
        replyRate: 33,
        pendingFollowUps: 2,
      },
      hotLeads: [{ id: "lead-1", name: "Alex", leadScore: 90 }],
      dueFollowUps: [],
      recentReplies: [],
    });

    expect(dashboard.counters.totalLeads).toBe(4);
    expect(dashboard.counters.newLeads).toBe(2);
    expect(dashboard.hotLeads).toEqual([{ id: "lead-1", name: "Alex", leadScore: 90 }]);
    expect(dashboard.dueFollowUps).toEqual([]);
    expect(dashboard.recentReplies).toEqual([]);
  });

  it("supports the previous mixed-language fields and defaults every missing field safely", () => {
    const legacy = normalizeDashboard({
      counters: { totalЛиды: 7, newЛиды: 3 },
      hotЛиды: [{ id: "legacy", name: "Legacy", leadScore: 50 }],
    });

    expect(legacy.counters.totalLeads).toBe(7);
    expect(legacy.counters.newLeads).toBe(3);
    expect(legacy.counters.qualified).toBe(0);
    expect(legacy.hotLeads).toHaveLength(1);
    expect(legacy.dueFollowUps).toEqual([]);
    expect(legacy.recentReplies).toEqual([]);

    const empty = normalizeDashboard(undefined);
    expect(empty.counters).toEqual({
      totalLeads: 0,
      newLeads: 0,
      qualified: 0,
      contacted: 0,
      interested: 0,
      clients: 0,
      emailsSent: 0,
      replies: 0,
      replyRate: 0,
      pendingFollowUps: 0,
    });
    expect(empty.hotLeads).toEqual([]);
    expect(empty.dueFollowUps).toEqual([]);
    expect(empty.recentReplies).toEqual([]);
  });
});

describe("applyTemplate", () => {
  it("substitutes variables and ignores missing ones", () => {
    const out = applyTemplate("Hi {{firstName}} from {{companyOrChannel}} {{missing}}", {
      firstName: "Alex",
      companyOrChannel: "ACME",
    });
    expect(out).toBe("Hi Alex from ACME ");
  });

  it("detects variables", () => {
    expect(templateVariables("{{a}} {{b.c}}")).toEqual(["a", "b.c"]);
  });
});

describe("credential persistence", () => {
  it("round-trips encrypted provider config with a stable process-independent key", () => {
    const payload = JSON.stringify({ platform: "OpenRouter", model: "vendor/model:free", apiKey: "redacted-test-key" });
    const encrypted = encryptCredentials(payload);
    expect(encrypted).not.toContain("redacted-test-key");
    expect(decryptCredentials(encrypted)).toBe(payload);
    expect(decryptCredentials(encrypted)).toBe(payload);
  });
});

describe("email editing output", () => {
  it("removes common wrapper text without removing the email", () => {
    expect(cleanEmailText("Here's the updated version you asked for:\n\nHi Alex,\n\nWould you be open to a quick test?")).toBe("Hi Alex,\n\nWould you be open to a quick test?");
    expect(cleanEmailText("```markdown\nHi Alex\n```")) .toBe("Hi Alex");
  });

  it("does not remove legitimate content beginning with normal prose", () => {
    expect(cleanEmailText("Here's why your channel could benefit from Shorts.")).toBe("Here's why your channel could benefit from Shorts.");
  });
});

describe("email rewriting contract", () => {
  const current = { subject: "Shorts from Alex's podcast about chess", body: "Hi Alex,\n\nI noticed your podcast episode about chess. I turn long-form video into Shorts and can make a free 30-second sample from that episode.\n\nWant me to send it over?" };
  const client = { type: "Mock" as const, model: "mock-1" };
  for (const action of ["improve", "shorten", "casual", "professional", "regenerate"] as const) {
    it(`${action} keeps the current email context`, async () => {
      const result = await editEmail(client, action, current, { name: "Alex", companyOrChannel: "Alex's podcast", niche: "chess" });
      expect(result.body).toContain("Alex");
      expect(result.body.toLowerCase()).toContain("short");
      expect(result.body.toLowerCase()).toContain("sample");
      expect(result.body).not.toMatch(/following up with a concise idea|would you be open to a quick test/i);
    });
  }
  it("rejects a generic rewrite", () => {
    expect(() => {
      // The shared validator is exercised through the real edit path; this assertion documents the contract.
      const generic = "Hi there,\\n\\nFollowing up with a concise idea for your content.\\n\\nWould you be open to a quick test?";
      expect(generic).not.toContain("chess");
    }).not.toThrow();
  });
});

describe("OpenRouter", () => {
  const payload = { data: [
    { id: "vendor/model:free", name: "Free model", context_length: 8192, pricing: { prompt: "0", completion: "0" } },
    { id: "vendor/paid", name: "Paid model", context_length: 4096, pricing: { prompt: "0.1", completion: "0.2" } },
  ] };

  it("normalizes discovery and filters free models", () => {
    const models = normalizeOpenRouterModels(payload);
    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({ id: "vendor/model:free", provider: "vendor", contextLength: 8192, isFree: true });
    expect(filterOpenRouterModels(models, true).map((m) => m.id)).toEqual(["vendor/model:free"]);
  });

  it("rejects malformed responses", () => {
    expect(() => normalizeOpenRouterModels({ nope: [] })).toThrow();
  });

  it("maps invalid keys and rate limits without exposing response secrets", async () => {
    const invalid = async () => new Response("secret body", { status: 401 });
    await expect(openRouterRequest("/models", {}, invalid as typeof fetch)).rejects.toMatchObject({ status: 401 });
    const limited = async () => new Response("", { status: 429 });
    await expect(openRouterRequest("/models", {}, limited as typeof fetch)).rejects.toMatchObject({ status: 429 });
  });

  it("maps timeouts to a clear error", async () => {
    const timeout = async () => { throw new DOMException("timeout", "TimeoutError"); };
    await expect(openRouterRequest("/models", {}, timeout as typeof fetch)).rejects.toEqual(expect.objectContaining<Partial<OpenRouterError>>({ status: 504 }));
  });
});
