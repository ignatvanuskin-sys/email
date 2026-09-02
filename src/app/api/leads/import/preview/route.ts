import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, unauthorized, badRequest } from "@/lib/api";
import { autoMapColumns, googleSheetCsvUrl, mapAndValidateRows, parseCsv, parseXlsx, type ImportMapping, type ImportRow, MAX_IMPORT_BYTES } from "@/lib/csv";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "lead-import-preview", 12, 60 * 60 * 1000);
  if (limited) return limited;
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const form = await req.formData();
    const source = String(form.get("source") ?? "file");
    const mappingRaw = String(form.get("mappings") ?? "");
    let records: ImportRow[];

    if (source === "google") {
      const sheetUrl = String(form.get("url") ?? "");
      let response: Response;
      try {
        response = await fetch(googleSheetCsvUrl(sheetUrl), { signal: AbortSignal.timeout(15_000), redirect: "follow", cache: "no-store" });
      } catch {
        return badRequest("Google Sheet is not publicly accessible. Make the sheet accessible or upload CSV/XLSX.");
      }
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/csv")) return badRequest("Google Sheet is not publicly accessible. Make the sheet accessible or upload CSV/XLSX.");
      const text = await response.text();
      records = parseCsv(text);
    } else {
      const file = form.get("file");
      if (!(file instanceof File)) return badRequest("Choose a CSV or XLSX file");
      if (file.size > MAX_IMPORT_BYTES) return badRequest("File exceeds the 5 MB import limit");
      const extension = (file.name.toLowerCase().split(".").pop() ?? "").toLowerCase();
      const xlsxExts = new Set(["xlsx", "xls", "xlsm"]);
      const csvExts = new Set(["csv", "tsv", "txt"]);
      const isXlsx = xlsxExts.has(extension);
      const isCsv = csvExts.has(extension) || file.type.includes("csv") || file.type.includes("sheet") || file.type.includes("text");
      const bytes = Buffer.from(await file.arrayBuffer());
      const isZipFile = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
      if (!isXlsx && !isCsv && !isZipFile) {
        return badRequest("Only CSV and XLSX files are supported");
      }
      if (isXlsx || isZipFile) {
        try { records = await parseXlsx(bytes); }
        catch { records = parseCsv(bytes.toString("utf8")); }
      } else {
        records = parseCsv(bytes.toString("utf8"));
      }
    }

    if (!records.length) return badRequest("The source contains no data rows");
    const headers = Object.keys(records[0]);
    const mappings: ImportMapping = mappingRaw ? JSON.parse(mappingRaw) : autoMapColumns(headers);
    const [leadEmails, localSuppressions, globalSuppressions] = await Promise.all([
      prisma.lead.findMany({ where: { userId: user.id, email: { not: null } }, select: { email: true } }),
      prisma.suppression.findMany({ where: { userId: user.id }, select: { email: true } }),
      prisma.globalSuppression.findMany({ select: { email: true } }),
    ]);
    const existing = new Set(leadEmails.map((row) => row.email!.toLowerCase()));
    const suppressed = new Set([...localSuppressions, ...globalSuppressions].map((row) => row.email.toLowerCase()));
    const rows = mapAndValidateRows(records, mappings, existing, suppressed);
    return ok({
      headers,
      mapping: mappings,
      rows: rows.slice(0, 250),
      records,
      counts: {
        total: rows.length,
        valid: rows.filter((row) => row.state === "valid").length,
        invalid: rows.filter((row) => row.state === "invalid").length,
        duplicates: rows.filter((row) => row.state === "duplicate").length,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
