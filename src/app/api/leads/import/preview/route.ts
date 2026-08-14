import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, unauthorized, badRequest } from "@/lib/api";
import { autoMapColumns, googleSheetCsvUrl, mapAndValidateRows, parseCsv, parseXlsx, type ImportMapping, type ImportRow, MAX_IMPORT_BYTES } from "@/lib/csv";

export async function POST(req: Request) {
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
      const extension = file.name.toLowerCase().split(".").pop();
      if (!extension || !["csv", "xlsx"].includes(extension)) return badRequest("Only CSV and XLSX files are supported");
      const bytes = Buffer.from(await file.arrayBuffer());
      records = extension === "xlsx" ? parseXlsx(bytes) : parseCsv(bytes.toString("utf8"));
    }

    if (!records.length) return badRequest("The source contains no data rows");
    const headers = Object.keys(records[0]);
    const mappings: ImportMapping = mappingRaw ? JSON.parse(mappingRaw) : autoMapColumns(headers);
    const existing = new Set((await prisma.lead.findMany({ where: { userId: user.id, email: { not: null } }, select: { email: true } })).map((row) => row.email!.toLowerCase()));
    const rows = mapAndValidateRows(records, mappings, existing);
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
