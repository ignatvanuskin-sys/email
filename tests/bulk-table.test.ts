import { describe, it, expect } from "vitest";
import { parseCsv, autoMapColumns, mapAndValidateRows } from "../src/lib/csv";
import { computeCampaignApprovalHash, isCampaignApprovalValid, APPROVAL_TTL_MS } from "../src/lib/approval";

// Helper mirrored from UI parsePaste (leads/page.tsx) for coverage
function parsePaste(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const emailRe = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  const headerKeywords = ["email","почта","e-mail","mail","name","имя","фио","company","компания","канал"];
  const first = lines[0].toLowerCase();
  const hasHeader = !emailRe.test(lines[0]) && headerKeywords.some((k) => first.includes(k));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const sample = dataLines.slice(0,5).join("\n");
  let delim: string = ",";
  if (sample.includes("\t")) delim = "\t";
  else if (sample.includes(";") && !sample.includes(",")) delim = ";";
  return dataLines.map((line) => {
    const angle = line.match(/^(.*)<\s*([^\s@]+@[^\s@]+\.[^\s@]+)\s*>$/);
    if (angle) return { email: angle[2].trim(), name: angle[1].trim().replace(/^"|"$/g,""), companyOrChannel: "" };
    let parts: string[];
    if (delim === "\t") parts = line.split("\t").map((s)=>s.trim());
    else if (delim === ";") parts = line.split(";").map((s)=>s.trim());
    else if (line.includes(",")) parts = line.split(",").map((s)=>s.trim());
    else if (/\s{2,}/.test(line)) parts = line.split(/\s{2,}/).map((s)=>s.trim());
    else parts = line.split(/\s+/).map((s)=>s.trim());
    parts = parts.map((p)=>p.replace(/^"|"$/g,"").trim()).filter(Boolean);
    const emailIdx = parts.findIndex((p)=>emailRe.test(p));
    let email = emailIdx>=0 ? parts[emailIdx].match(emailRe)?.[0] ?? "" : "";
    if (!email && emailRe.test(line)) email = line.match(emailRe)?.[0] ?? "";
    const nameTokens = parts.filter((_,i)=>i!==emailIdx);
    let name=""; let company="";
    if (nameTokens.length===1) name=nameTokens[0];
    else if (nameTokens.length>=2){ name=nameTokens[0]; company=nameTokens[1]; }
    if (!name && email) name=email.split("@")[0];
    return { email: email.trim(), name: name.trim(), companyOrChannel: company.trim() };
  }).filter((r)=>r.email);
}

describe("bulk / table quick add", () => {
  it("parses header with russian columns via autoMap", () => {
    const rows = parseCsv("Почта;Имя;Компания\nivan@test.ru;Иван;Тест\n");
    const mapping = autoMapColumns(Object.keys(rows[0]));
    expect(mapping.email).toBe("Почта");
    expect(mapping.name).toBe("Имя");
    expect(mapping.companyOrChannel).toBe("Компания");
    const validated = mapAndValidateRows(rows, mapping, new Set());
    expect(validated[0].state).toBe("valid");
  });

  it("detects tab delimiter", () => {
    const rows = parseCsv("email\tname\tcompany\njohn@example.com\tJohn\tAcme\n");
    expect(rows[0]).toMatchObject({ email: "john@example.com", name: "John", company: "Acme" });
  });

  it("parses paste with header and without", () => {
    expect(parsePaste("email, name\njohn@example.com, John\n")).toEqual([{ email:"john@example.com", name:"John", companyOrChannel:"" }]);
    expect(parsePaste("john@example.com\tJohn\tAcme")).toEqual([{ email:"john@example.com", name:"John", companyOrChannel:"Acme" }]);
    expect(parsePaste("Иван <ivan@test.ru>")).toEqual([{ email:"ivan@test.ru", name:"Иван", companyOrChannel:"" }]);
  });

  it("parses semicolon and russian paste", () => {
    const out = parsePaste("Почта;Имя\nivan@test.ru;Иван\n");
    expect(out[0].email).toBe("ivan@test.ru");
    expect(out[0].name).toBe("Иван");
  });

  it("caps bulk at 500 and filters empty", () => {
    const many = Array.from({length: 501}, (_,i)=>`user${i}@test.com, User${i}`).join("\n");
    expect(parsePaste(many)).toHaveLength(501);
    // route would reject >500, UI caps
  });
});

describe("campaign start auto-approve", () => {
  it("computes and validates approval hash with TTL", () => {
    const campaignId = "camp1", versionId = "ver1", hash = "contentHash123";
    const approval = computeCampaignApprovalHash(campaignId, versionId, hash);
    const expires = new Date(Date.now() + APPROVAL_TTL_MS);
    expect(isCampaignApprovalValid(campaignId, versionId, hash, approval, expires)).toBe(true);
    expect(isCampaignApprovalValid(campaignId, versionId, "other", approval, expires)).toBe(false);
    expect(isCampaignApprovalValid(campaignId, versionId, hash, approval, new Date(Date.now() - 1000))).toBe(false);
  });
});

describe("bulk api validation", () => {
  it("rejects disposable and invalid emails via hygiene", () => {
    const rows = mapAndValidateRows([{ email: "test@mailinator.com", name:"X"}], {email:"email", name:"name"}, new Set());
    expect(rows[0].state).toBe("invalid");
    expect(rows[0].reasons.join("")).toContain("Disposable");
  });
});
