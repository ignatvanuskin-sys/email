import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseCsv,
  parseXlsx,
  autoMapColumns,
  mapAndValidateRows,
  normalizeEmail,
  isValidEmail,
  hasFormulaInjection,
  validateGoogleSheetUrl,
  googleSheetCsvUrl,
  sanitizeCell,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_BYTES,
} from "../src/lib/csv";

describe("CSV parsing", () => {
  it("strips a UTF-8 BOM", () => {
    const rows = parseCsv("\uFEFFemail,name\nA@x.com,Alex\n");
    expect(rows[0].email).toBe("A@x.com");
  });

  it("detects a semicolon delimiter automatically", () => {
    const rows = parseCsv("name;email;company\nJohn;john@example.com;Acme\n");
    expect(rows[0]).toMatchObject({ name: "John", company: "Acme" });
  });

  it("parses quoted fields containing delimiters", () => {
    const [row] = parseCsv(`email,name\n"a@b.com","Doe, John"\n`);
    expect(row.name).toBe("Doe, John");
  });

  it("handles newlines inside quoted values", () => {
    const [row] = parseCsv(`email,notes\n"a@b.com","line one\nline two"\n`);
    expect(row.notes).toBe("line one\nline two");
  });

  it("trims headers and empty rows", () => {
    const rows = parseCsv(" email , name \n x@y.com , Zi\n\n  \nz@w.com,An\n");
    expect(rows).toHaveLength(2);
  });
});

describe("XLSX parsing", () => {
  it("parses the first worksheet into rows", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      { email: "a@x.com", name: "A", company: "Acme" },
      { email: "b@x.com", name: "B", company: "Beta" },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const rows = parseXlsx(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ email: "a@x.com", name: "A", company: "Acme" });
  });

  it("parses and trims header keys", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ "Full Name": "Alice", "Email Address": "a@x.com" }]);
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const rows = parseXlsx(buffer);
    expect(rows[0]["Full Name"]).toBe("Alice");
  });
});

describe("Google Sheets", () => {
  it("validates a valid sheets URL", () => {
    expect(validateGoogleSheetUrl("https://docs.google.com/spreadsheets/d/abc123XYZ_/edit?gid=0")).toEqual({ id: "abc123XYZ_", gid: "0" });
  });

  it("rejects non-google or invalid URLs", () => {
    expect(() => validateGoogleSheetUrl("https://example.com/x")).toThrow();
    expect(() => validateGoogleSheetUrl("https://docs.google.com/document/d/abc")).toThrow();
    expect(() => validateGoogleSheetUrl("not a url")).toThrow();
  });

  it("builds a public CSV export URL", () => {
    expect(googleSheetCsvUrl("https://docs.google.com/spreadsheets/d/abc123/edit")).toBe("https://docs.google.com/spreadsheets/d/abc123/export?format=csv");
    expect(googleSheetCsvUrl("https://docs.google.com/spreadsheets/d/abc123/edit#gid=5")).toContain("/export?format=csv");
  });
});

describe("column mapping", () => {
  it("auto-maps alias headers to canonical fields", () => {
    const headers = ["email_address", "full_name", "company_name", "unused"];
    const mapping = autoMapColumns(headers);
    expect(mapping.email).toBe("email_address");
    expect(mapping.name).toBe("full_name");
    expect(mapping.companyOrChannel).toBe("company_name");
    expect(mapping.unused).toBeUndefined();
  });

  it("matches mixed-case and hyphenated headers", () => {
    const mapping = autoMapColumns(["Email-Address", "Full Name"]);
    expect(mapping.email).toBe("Email-Address");
    expect(mapping.name).toBe("Full Name");
  });
});

describe("validation, normalization and duplicates", () => {
  it("normalizes email to lowercase trim", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
  });

  it("accepts valid emails and rejects bad shapes", () => {
    expect(isValidEmail("alex@example.com")).toBe(true);
    expect(isValidEmail("alex@")).toBe(false);
    expect(isValidEmail("test")).toBe(false);
    expect(isValidEmail("something")).toBe(false);
  });

  it("flags invalid and missing emails, and detects duplicates", () => {
    const rows = mapAndValidateRows(
      [{ email: "a@x.com", name: "A" }, { email: "bad", name: "B" }, { email: "dup@x.com", name: "C" }],
      { email: "email", name: "name" },
      new Set(["dup@x.com"]),
    );
    expect(rows[0].state).toBe("valid");
    expect(rows[1].state).toBe("invalid");
    expect(rows[2].state).toBe("duplicate");
    expect(rows[2].reasons.join(";")).toContain("Duplicate");
  });

  it("detects duplicates inside the file itself and normalizes case", () => {
    const rows = mapAndValidateRows(
      [{ email: "a@x.com" }, { email: "A@x.com" }],
      { email: "email" },
      new Set(),
    );
    expect(rows[1].state).toBe("duplicate");
  });

  it("treats missing name as non-blocking (valid remains importable)", () => {
    const row = mapAndValidateRows([{ email: "a@x.com", name: "" }], { email: "email", name: "name" }, new Set())[0];
    expect(row.state).toBe("valid");
    expect(row.isValid).toBe(true);
    expect(row.reasons).toContain("Missing name");
  });

  it("requires an email", () => {
    const row = mapAndValidateRows([{ name: "No email" }], { email: "email", name: "name" }, new Set())[0];
    expect(row.state).toBe("invalid");
    expect(row.reasons).toContain("Email is required");
  });
});

describe("CSV / formula injection protection", () => {
  it("detects formula prefixes but treats negative numbers as safe", () => {
    expect(hasFormulaInjection("=HYPERLINK(\"x\")")).toBe(true);
    expect(hasFormulaInjection("+cmd()")).toBe(true);
    expect(hasFormulaInjection("@sum")).toBe(true);
    expect(hasFormulaInjection("-2")).toBe(false);
    expect(hasFormulaInjection("plain text")).toBe(false);
  });

  it("blocks rows whose mapped cells carry injection payloads", () => {
    const row = mapAndValidateRows(
      [{ email: "safe@example.com", name: "=HYPERLINK(\"https://evil.test\")" }],
      { email: "email", name: "name" },
      new Set(),
    )[0];
    expect(row.state).toBe("invalid");
    expect(row.isValid).toBe(false);
    expect(row.reasons).toContain("Potential CSV formula injection");
  });

  it("keeps raw cell text available for validation checks", () => {
    expect(sanitizeCell("  =SUM(A1)  ")).toBe("=SUM(A1)");
  });
});

describe("import limits", () => {
  it("enforces finite limits", () => {
    expect(MAX_IMPORT_ROWS).toBeGreaterThan(0);
    expect(MAX_IMPORT_ROWS).toBeLessThanOrEqual(5_000);
    expect(MAX_IMPORT_BYTES).toBe(5 * 1024 * 1024);
  });

  it("rejects files above the row limit", () => {
    const records = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ email: `u${i}@x.com` }));
    const body = "email\n" + records.map((r) => r.email).join("\n") + "\n";
    expect(() => parseCsv(body)).toThrow(/limited to/);
  });
});

describe("email validation edge cases", () => {
  it("rejects emails that are too long", () => {
    expect(isValidEmail("a".repeat(310) + "@example.com")).toBe(false);
  });

  it("accepts standard valid emails", () => {
    expect(isValidEmail("user+tag@sub.domain.com")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  it("normalizes unicode and trims whitespace", () => {
    expect(normalizeEmail("  Алиса@Пример.рф ")).toBe("алиса@пример.рф");
  });
});

describe("column mapping edge cases", () => {
  it("ignores unknown headers and preserves case of mapped header", () => {
    const mapping = autoMapColumns(["email", "name", "unknown_field", "company"]);
    expect(mapping.email).toBe("email");
    expect(mapping.name).toBe("name");
    expect(mapping.companyOrChannel).toBe("company");
    expect(mapping.unknown_field).toBeUndefined();
  });

  it("falls back when no alias matches", () => {
    const mapping = autoMapColumns(["foo", "bar"]);
    expect(mapping).toEqual({});
  });
});

describe("duplicate and case normalization", () => {
  it("detects duplicates with different casing and surrounding spaces", () => {
    const rows = mapAndValidateRows(
      [{ email: "  A@X.COM  ", name: "A" }, { email: "a@x.com", name: "B" }],
      { email: "email", name: "name" },
      new Set(),
    );
    expect(rows[0].state).toBe("valid");
    expect(rows[1].state).toBe("duplicate");
  });
});

describe("formula injection across mapped fields", () => {
  it("blocks injection in any mapped field, not just email", () => {
    const row = mapAndValidateRows(
      [{ email: "safe@example.com", name: "John", companyOrChannel: "=1+1" }],
      { email: "email", name: "name", companyOrChannel: "companyOrChannel" },
      new Set(),
    );
    expect(row[0].state).toBe("invalid");
    expect(row[0].reasons).toContain("Potential CSV formula injection");
  });
});

describe("parseCsv edge cases", () => {
  it("handles empty quoted fields", () => {
    const [row] = parseCsv(`email,name\n"a@b.com",""`);
    expect(row.name).toBe("");
  });

  it("rejects oversized input", () => {
    expect(() => parseCsv("email\n" + "a@b.com,".repeat(200_000))).toThrow(/limited to|Invalid Record Length/);
  });
});


