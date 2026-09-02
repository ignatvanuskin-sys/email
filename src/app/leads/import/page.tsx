"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";
import { useGsapReveal } from "@/hooks/useGsapAnimations";
import type { ImportMapping, ImportPreviewRow } from "@/lib/csv";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";

type PreviewResponse = {
  headers: string[];
  mapping: ImportMapping;
  rows: ImportPreviewRow[];
  records: Record<string, string>[];
  counts: { total: number; valid: number; invalid: number; duplicates: number };
};
type CommitResponse = { imported: number; duplicates: number; invalid: number };

const DEST_FIELDS: Array<{ key: string; label: string; required: boolean }> = [
  { key: "email", label: "Email", required: true },
  { key: "name", label: "Name", required: false },
  { key: "companyOrChannel", label: "Company", required: false },
  { key: "websiteUrl", label: "Website", required: false },
  { key: "youtubeUrl", label: "YouTube", required: false },
  { key: "niche", label: "Niche", required: false },
  { key: "followersCount", label: "Followers", required: false },
];

type Step = "upload" | "map" | "review" | "complete";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map" },
  { id: "review", label: "Review" },
  { id: "complete", label: "Import" },
];

export default function ImportLeadsPage() {
  const { notify } = useToast();
  const [tab, setTab] = useState<"file" | "google" | "table">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useGsapReveal<HTMLDivElement>([step]);

  const runPreview = useCallback(async (mappings?: ImportMapping) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("source", tab);
      if (tab === "google") {
        if (!url) throw new Error("Enter a Google Sheets URL");
        form.set("url", url);
      } else {
        if (!file) throw new Error("Choose a CSV or XLSX file");
        form.set("file", file);
      }
      if (mappings) form.set("mappings", JSON.stringify(mappings));
      const res = await fetch("/api/leads/import/preview", { method: "POST", body: form, cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Preview failed");
      setData(body as PreviewResponse);
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }, [tab, url, file]);

  const changeMapping = useCallback((field: string, value: string) => {
    if (!data) return;
    const next = { ...data.mapping, [field]: value };
    setData({ ...data, mapping: next });
    runPreview(next);
  }, [data, runPreview]);

  // Таблица / быстрый paste: парсит таб/запятая/";" и "Name <email>"
  const parsePaste = (text: string) => {
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
  };

  const tableLeads = parsePaste(paste);

  const commitTable = async () => {
    if (!tableLeads.length) { setError("Не найдено ни одного email"); return; }
    setBusy(true); setError("");
    try {
      const res = await api<CommitResponse>("/api/leads/bulk", { method:"POST", body: JSON.stringify({ leads: tableLeads }) });
      setResult(res); setStep("complete");
      notify(`${res.imported} контактов импортировано`, res.imported ? "success" : "info");
    } catch(e){ setError(e instanceof Error ? e.message : "Ошибка импорта таблицы"); }
    finally{ setBusy(false); }
  };

  const commit = async () => {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<CommitResponse>("/api/leads/import/commit", {
        method: "POST",
        body: JSON.stringify({ records: data.records, mappings: data.mapping, skipDuplicates }),
      });
      setResult(res);
      setStep("complete");
      notify(`${res.imported} lead(s) imported.`, res.imported > 0 ? "success" : "info");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => { setData(null); setFile(null); setUrl(""); setPaste(""); setResult(null); setStep("upload"); };

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Import leads" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text="Upload a CSV, XLSX or a public Google Sheet in a few steps." speed={3} /></p>
        </div>
        <Link href="/leads" className="btn btn-ghost">← Back to leads</Link>
      </div>

      <div className="stepper" role="tablist" aria-label="Import steps">
        {STEPS.map((s, i) => {
          const order = ["upload", "map", "review", "complete"];
          const cur = order.indexOf(step);
          const idx = order.indexOf(s.id);
          const stateClass = idx === cur ? "active" : idx < cur ? "done" : "";
          return (
            <button key={s.id} className={`step ${stateClass}`} onClick={() => idx < cur && setStep(s.id)} disabled={idx > cur} aria-current={idx === cur ? "step" : undefined}>
              <span className="step-num">{idx < cur ? "✓" : i + 1}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="card" style={{ padding: 12, marginBottom: 16, borderColor: "var(--red)", color: "var(--red)" }} role="alert">{error}</div>}

      <PageTransition>
        <div ref={contentRef}>

      {step === "upload" && (
        <div className="card card-glass" style={{ padding: 28, maxWidth: 720 }}>
          <div className="tabs" role="tablist" aria-label="Import source">
            <button role="tab" aria-selected={tab === "file"} className={`tab ${tab === "file" ? "active" : ""}`} onClick={() => setTab("file")}>Файл</button>
            <button role="tab" aria-selected={tab === "table"} className={`tab ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>Таблица</button>
            <button role="tab" aria-selected={tab === "google"} className={`tab ${tab === "google" ? "active" : ""}`} onClick={() => setTab("google")}>Google Sheets</button>
          </div>

          {tab === "file" ? (
            <div style={{ marginTop: 20 }}>
              <div
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const dropped = e.dataTransfer.files?.[0]; if (dropped) setFile(dropped); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="dz-icon" aria-hidden>📥</div>
                <div className="dz-title">{file ? `Ready: ${file.name}` : "Drop CSV or XLSX here"}</div>
                <div className="dz-sub">{file ? "Review columns next, or pick a different file." : "or click to browse"}</div>
                <div className="dz-sub" style={{ color: "var(--text-faint)" }}>CSV / XLSX / XLS · UTF-8 · up to 5 000 rows</div>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Choose a CSV or XLSX file" />
              </div>
              <div className="small muted" style={{ marginTop:10 }}>Поддерживаются русские заголовки: «Почта», «Имя», «Компания». Разделители таб/запятая/«;» определяются автоматически.</div>
              <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
                <button className="btn btn-primary" disabled={!file || busy} onClick={() => runPreview()}>
                  {busy ? <><span className="spinner" /> Parsing…</> : "Preview & map columns"}
                </button>
              </div>
            </div>
          ) : tab === "table" ? (
            <div style={{ marginTop: 20 }}>
              <div className="field">
                <label htmlFor="paste">Вставьте таблицу (скопируйте из Excel/Sheets)</label>
                <textarea id="paste" className="input" rows={8} placeholder={"ivan@test.ru\tИван\tООО Тест\nalex@example.com, Alex Rivera, Acme\njane@example.com Jane Corp"} value={paste} onChange={(e)=>setPaste(e.target.value)} style={{ fontFamily:"monospace", fontSize:13 }} />
              </div>
              <div className="small muted">Строк: {paste.split(/\r?\n/).filter((l)=>l.trim()).length} · Найдено email: {tableLeads.length} {tableLeads.length>500 && <span style={{color:"var(--red)"}}> — максимум 500 за раз</span>}</div>
              {tableLeads.length>0 && (
                <div className="table-wrap" style={{ maxHeight:180, marginTop:12, border:"1px solid var(--border)", borderRadius:8 }}>
                  <table className="data-table"><thead><tr><th>Email</th><th>Имя</th><th>Компания</th></tr></thead><tbody>{tableLeads.slice(0,20).map((r,i)=><tr key={i}><td>{r.email}</td><td>{r.name}</td><td>{r.companyOrChannel}</td></tr>)}</tbody></table>
                  {tableLeads.length>20 && <div className="small muted" style={{ padding:6, textAlign:"center" }}>… и ещё {tableLeads.length-20}</div>}
                </div>
              )}
              <div className="row" style={{ marginTop: 16, justifyContent:"flex-end" }}>
                <button className="btn btn-primary" disabled={!paste.trim() || busy || !tableLeads.length || tableLeads.length>500} onClick={commitTable}>
                  {busy ? <><span className="spinner" /> Импорт…</> : `Импортировать ${tableLeads.length || ""}`}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <div className="field">
                <label htmlFor="gs-url">Google Sheets URL</label>
                <input id="gs-url" className="input" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <p className="small muted" style={{ marginBottom: 16 }}>
                The sheet must be <strong>publicly accessible</strong> (shared with “anyone with the link”). No OAuth is required.
              </p>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-primary" disabled={!url.trim() || busy} onClick={() => runPreview()}>
                  {busy ? <><span className="spinner" /> Fetching…</> : "Fetch sheet"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "map" && data && (
        <div className="card" style={{ padding: 24, maxWidth: 720 }}>
          <div className="section-label">Column mapping</div>
          <p className="small muted" style={{ marginTop: 0 }}>We matched these automatically — adjust if needed. <strong>Email</strong> is required.</p>
          <div className="stack" style={{ gap: 10, margin: "16px 0" }}>
            {DEST_FIELDS.map((f) => (
              <div key={f.key} className="row">
                <label className="grow" style={{ fontWeight: 600, fontSize: 14 }}>→ {f.label}{f.required ? " *" : ""}</label>
                <select className="select" style={{ maxWidth: 320 }} aria-label={`Map ${f.label}`} value={data.mapping[f.key] ?? ""} onChange={(e) => changeMapping(f.key, e.target.value)}>
                  <option value="">Ignore</option>
                  {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!data.mapping.email && <div className="small" style={{ color: "var(--amber)", margin: "4px 0 12px" }}>⚠ Map a source column to Email to continue.</div>}
          <Summary counts={data.counts} />
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep("upload")}>Back</button>
            <button className="btn btn-primary" disabled={!data.mapping.email || busy} onClick={() => setStep("review")}>Review import</button>
          </div>
        </div>
      )}


      {step === "review" && data && (
        <div className="card" style={{ padding: 24, maxWidth: 720 }}>
          <div className="section-label">Review</div>
          <Summary counts={data.counts} large />
          <label className="row" style={{ margin: "14px 0 18px", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
            <span style={{ fontWeight: 600 }}>Skip duplicates</span>
            <span className="small muted">Already-existing or in-file duplicates will not be imported.</span>
          </label>
          <PreviewTable rows={data.rows} />
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep("map")}>Back</button>
            <button className="btn btn-primary" disabled={busy || data.counts.valid === 0} onClick={commit}>
              {busy ? <><span className="spinner" /> Importing…</> : `Import ${data.counts.valid} valid` + (data.counts.duplicates ? ` (+${data.counts.duplicates} skipped)` : "")}
            </button>
          </div>
        </div>
      )}

      {step === "complete" && result && (
        <div className="card stagger" style={{ padding: 32, maxWidth: 720, textAlign: "center" }}>
          <div className="es-icon" style={{ margin: "0 auto 14px", width: 72, height: 72, background: "var(--green-bg)", color: "var(--green)" }} aria-hidden>✓</div>
          <h2 className="page-title" style={{ marginBottom: 8 }}>Import complete</h2>
          <div className="stack" style={{ gap: 8, margin: "20px 0", fontSize: 15 }}>
            <div><span style={{ color: "var(--green)", fontWeight: 700 }}>✓ {result.imported}</span> imported</div>
            {result.duplicates > 0 && <div><span style={{ color: "var(--amber)", fontWeight: 700 }}>↻ {result.duplicates}</span> duplicates skipped</div>}
            {result.invalid > 0 && <div><span style={{ color: "var(--red)", fontWeight: 700 }}>✕ {result.invalid}</span> invalid skipped</div>}
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
            <Link href="/leads" className="btn btn-primary btn-lg">View imported leads</Link>
            <button className="btn" onClick={resetAll}>Import more</button>
          </div>
        </div>
      )}
        </div>
      </PageTransition>
    </div>
  );
}

function Summary({ counts, large }: { counts: PreviewResponse["counts"]; large?: boolean }) {
  const items = [
    { label: "Total rows", value: counts.total, cls: "" },
    { label: "Valid", value: counts.valid, cls: "var(--green)" },
    { label: "Invalid", value: counts.invalid, cls: "var(--red)" },
    { label: "Duplicates", value: counts.duplicates, cls: "var(--amber)" },
  ];
  return (
    <div className="metric-grid" style={{ marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
      {items.map((it) => (
        <div key={it.label} className="metric" style={{ padding: 14 }}>
          <div className="label">{it.label}</div>
          <div className="value" style={{ fontSize: large ? 30 : 24, color: it.cls || undefined }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function PreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 320 }}>
      <table className="data-table">
        <thead>
          <tr><th>Status</th><th>Email</th><th>Name</th><th>Company</th></tr>
        </thead>
        <tbody>
          {rows.slice(0, 60).map((row) => (
            <tr key={row.index} className={row.isValid ? "selected" : ""}>
              <td data-label="Status">{row.state === "valid" ? <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span> : row.state === "duplicate" ? <span style={{ color: "var(--amber)", fontWeight: 700 }}>⚠</span> : <span style={{ color: "var(--red)", fontWeight: 700 }}>✕</span>}</td>
              <td data-label="Email">{row.values.email || <span className="muted">—</span>}</td>
              <td data-label="Name">{row.values.name || <span className="muted">—</span>}</td>
              <td data-label="Company">{row.values.companyOrChannel || <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 60 && <div className="small muted" style={{ padding: 8, textAlign: "center" }}>Showing first 60 of {rows.length} rows.</div>}
    </div>
  );
}

