"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import type { ImportMapping, ImportPreviewRow } from "@/lib/csv";

type PreviewResponse = {
  headers: string[];
  mapping: ImportMapping;
  rows: ImportPreviewRow[];
  records: Record<string, string>[];
  counts: { total: number; valid: number; invalid: number; duplicates: number };
};
type CommitResponse = { imported: number; duplicates: number; invalid: number };

const DEST_FIELDS: Array<{ key: string; label: string; required: boolean }> = [
  { key: "email", label: "Электронная почта", required: true },
  { key: "name", label: "Имя", required: false },
  { key: "companyOrChannel", label: "Компания или канал", required: false },
  { key: "websiteUrl", label: "Сайт", required: false },
  { key: "youtubeUrl", label: "YouTube", required: false },
  { key: "niche", label: "Сфера", required: false },
  { key: "followersCount", label: "Подписчики", required: false },
];

type Step = "upload" | "map" | "review" | "complete";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "upload", label: "Загрузка" },
  { id: "map", label: "Поля" },
  { id: "review", label: "Проверка" },
  { id: "complete", label: "Готово" },
];

export default function ImportLeadsPage() {
  const { notify } = useToast();
  const [tab, setTab] = useState<"file" | "google">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runPreview = useCallback(async (mappings?: ImportMapping) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("source", tab);
      if (tab === "google") {
        if (!url.trim()) throw new Error("Укажите ссылку на Google Таблицу.");
        form.set("url", url.trim());
      } else {
        if (!file) throw new Error("Выберите файл CSV или XLSX.");
        form.set("file", file);
      }
      if (mappings) form.set("mappings", JSON.stringify(mappings));
      const response = await fetch("/api/leads/import/preview", { method: "POST", body: form, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Не удалось проверить источник.");
      setData(body as PreviewResponse);
      setStep("map");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось прочитать источник.");
    } finally {
      setBusy(false);
    }
  }, [tab, url, file]);

  const changeMapping = useCallback((field: string, value: string) => {
    if (!data) return;
    const next = { ...data.mapping, [field]: value };
    setData({ ...data, mapping: next });
    void runPreview(next);
  }, [data, runPreview]);

  const commit = async () => {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const response = await api<CommitResponse>("/api/leads/import/commit", { method: "POST", body: JSON.stringify({ records: data.records, mappings: data.mapping, skipDuplicates }) });
      setResult(response);
      setStep("complete");
      notify(`Добавлено контактов: ${response.imported}.`, response.imported > 0 ? "success" : "info");
    } catch {
      setError("Не удалось сохранить контакты. Проверьте данные и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => { setData(null); setFile(null); setUrl(""); setResult(null); setStep("upload"); setError(""); };
  const currentIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <div>
      <div className="page-head"><div><h1 className="page-title">Импорт контактов</h1><p className="page-sub">Загрузите список, проверьте данные и добавьте их в рабочее пространство.</p></div><Link href="/leads" className="btn btn-ghost">← К контактам</Link></div>
      <div className="stepper" role="tablist" aria-label="Шаги импорта">{STEPS.map((item, index) => <button key={item.id} className={`step ${index === currentIndex ? "active" : index < currentIndex ? "done" : ""}`} onClick={() => index < currentIndex && setStep(item.id)} disabled={index > currentIndex} aria-current={index === currentIndex ? "step" : undefined}><span className="step-num">{index < currentIndex ? "✓" : index + 1}</span><span>{item.label}</span></button>)}</div>
      {error && <div className="card friendly-error" role="alert">{error}</div>}

      {step === "upload" && <section className="card import-card">
        <div className="tabs" role="tablist" aria-label="Источник контактов"><button role="tab" aria-selected={tab === "file"} className={`tab ${tab === "file" ? "active" : ""}`} onClick={() => setTab("file")}>Файл CSV или XLSX</button><button role="tab" aria-selected={tab === "google"} className={`tab ${tab === "google" ? "active" : ""}`} onClick={() => setTab("google")}>Google Таблицы</button></div>
        {tab === "file" ? <div style={{ marginTop: 20 }}>
          <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files?.[0]; if (dropped) setFile(dropped); }} onClick={() => fileInputRef.current?.click()}>
            <div className="dz-icon" aria-hidden>⇪</div><div className="dz-title">{file ? `Выбран файл: ${file.name}` : "Перетащите файл сюда"}</div><div className="dz-sub">{file ? "Нажмите, чтобы выбрать другой файл, или продолжите." : "или нажмите, чтобы выбрать файл на компьютере"}</div><div className="dz-sub" style={{ color: "var(--text-faint)" }}>CSV или XLSX · до 5 000 строк</div><input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} aria-label="Выбрать CSV или XLSX файл" />
          </div><div className="import-actions"><button className="btn btn-primary" disabled={!file || busy} onClick={() => void runPreview()}>{busy ? <><span className="spinner" /> Читаем файл…</> : "Продолжить"}</button></div>
        </div> : <div style={{ marginTop: 20 }}>
          <div className="field"><label htmlFor="gs-url">Ссылка на Google Таблицу</label><input id="gs-url" className="input" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(event) => setUrl(event.target.value)} /></div><p className="small muted import-note">Таблица должна быть открыта по ссылке для чтения. Вход в Google не требуется.</p><div className="import-actions"><button className="btn btn-primary" disabled={!url.trim() || busy} onClick={() => void runPreview()}>{busy ? <><span className="spinner" /> Загружаем…</> : "Продолжить"}</button></div>
        </div>}
      </section>}

      {step === "map" && data && <section className="card import-card"><div className="section-label">Сопоставьте столбцы</div><p className="small muted import-note">Мы сопоставили поля автоматически. Проверьте их и при необходимости измените. Электронная почта обязательна.</p><div className="stack import-mapping">{DEST_FIELDS.map((field) => <div key={field.key} className="row import-map-row"><label className="grow" style={{ fontWeight: 600, fontSize: 14 }}>{field.label}{field.required ? " *" : ""}</label><select className="select" aria-label={`Сопоставить ${field.label}`} value={data.mapping[field.key] ?? ""} onChange={(event) => changeMapping(field.key, event.target.value)}><option value="">Не использовать</option>{data.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></div>)}</div>{!data.mapping.email && <div className="small import-warning">⚠ Выберите столбец с электронной почтой, чтобы продолжить.</div>}<Summary counts={data.counts} /><div className="import-actions"><button className="btn btn-ghost" onClick={() => setStep("upload")}>Назад</button><button className="btn btn-primary" disabled={!data.mapping.email || busy} onClick={() => setStep("review")}>Проверить данные</button></div></section>}

      {step === "review" && data && <section className="card import-card"><div className="section-label">Проверка перед сохранением</div><Summary counts={data.counts} large /><label className="row import-checkbox"><input type="checkbox" checked={skipDuplicates} onChange={(event) => setSkipDuplicates(event.target.checked)} /><span><strong>Не добавлять дубли</strong><span className="small muted" style={{ display: "block" }}>Повторяющиеся контакты будут пропущены.</span></span></label><PreviewTable rows={data.rows} /><div className="import-actions"><button className="btn btn-ghost" onClick={() => setStep("map")}>Назад</button><button className="btn btn-primary" disabled={busy || data.counts.valid === 0} onClick={() => void commit()}>{busy ? <><span className="spinner" /> Сохраняем…</> : `Добавить ${data.counts.valid} контактов`}</button></div></section>}

      {step === "complete" && result && <section className="card import-complete"><div className="es-icon" style={{ margin: "0 auto 14px", width: 72, height: 72, background: "var(--green-bg)", color: "var(--green)" }} aria-hidden>✓</div><h2 className="page-title" style={{ marginBottom: 8 }}>Контакты добавлены</h2><div className="stack" style={{ gap: 8, margin: "20px 0", fontSize: 15 }}><div><span className="import-result-success">✓ {result.imported}</span> добавлено</div>{result.duplicates > 0 && <div><span className="import-result-warning">↻ {result.duplicates}</span> дублей пропущено</div>}{result.invalid > 0 && <div><span className="import-result-error">✕ {result.invalid}</span> строк с ошибками пропущено</div>}</div><div className="row import-complete-actions"><Link href="/leads" className="btn btn-primary btn-lg">Открыть контакты</Link><button className="btn" onClick={resetAll}>Импортировать ещё</button></div></section>}
    </div>
  );
}

function Summary({ counts, large }: { counts: PreviewResponse["counts"]; large?: boolean }) {
  const items = [{ label: "Всего строк", value: counts.total, color: "" }, { label: "Можно добавить", value: counts.valid, color: "var(--green)" }, { label: "С ошибками", value: counts.invalid, color: "var(--red)" }, { label: "Дубли", value: counts.duplicates, color: "var(--amber)" }];
  return <div className="metric-grid import-summary">{items.map((item) => <div key={item.label} className="metric"><div className="label">{item.label}</div><div className="value" style={{ fontSize: large ? 30 : 24, color: item.color || undefined }}>{item.value}</div></div>)}</div>;
}

function PreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  return <div className="table-wrap import-preview"><table className="data-table"><thead><tr><th>Состояние</th><th>Электронная почта</th><th>Имя</th><th>Компания</th></tr></thead><tbody>{rows.slice(0, 60).map((row) => <tr key={row.index} className={row.isValid ? "selected" : ""}><td data-label="Состояние">{row.state === "valid" ? <span className="import-result-success">✓ Корректно</span> : row.state === "duplicate" ? <span className="import-result-warning">⚠ Дубль</span> : <span className="import-result-error">✕ Ошибка</span>}</td><td data-label="Электронная почта">{row.values.email || <span className="muted">—</span>}</td><td data-label="Имя">{row.values.name || <span className="muted">—</span>}</td><td data-label="Компания">{row.values.companyOrChannel || <span className="muted">—</span>}</td></tr>)}</tbody></table>{rows.length > 60 && <div className="small muted" style={{ padding: 8, textAlign: "center" }}>Показаны первые 60 из {rows.length} строк.</div>}</div>;
}
