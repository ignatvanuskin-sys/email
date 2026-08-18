"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import type { EmailDocument } from "@/lib/emailBuilder";
import { BuilderPanel } from "./BuilderPanel";

const VARIABLES = ["{{firstName}}", "{{company}}", "{{website}}", "{{channel}}", "{{telegram}}"];

const CATEGORIES = ["Cold outreach", "Partnership", "YouTube", "Telegram", "Agency", "Follow-up", "Custom"];

type Template = {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  documentJson?: string | null;
};

export default function EditTemplatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const [form, setForm] = useState({ name: "", category: "Cold outreach", subject: "", body: "", documentJson: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dynamicMode, setDynamicMode] = useState(false);
  const [dynamicField, setDynamicField] = useState("niche");
  const [dynamicValue, setDynamicValue] = useState("");
  const [dynamicContent, setDynamicContent] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [document, setDocument] = useState<EmailDocument>({ version: 1, blocks: [], styles: { accentColor: "#2563eb", maxWidth: 600 } });
  const [builderMode, setBuilderMode] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [sections, setSections] = useState<Array<{ id: string; name: string; documentJson: string }>>([]);
  const [compatibility, setCompatibility] = useState<Array<{ code: string; severity: string; client: string; message: string }>>([]);
  const [sectionName, setSectionName] = useState("");

  const load = useCallback(async () => {
    try {
      const t = await api<Template>(`/api/templates/${params.id}`);
      setForm({ name: t.name, category: t.category, subject: t.subject, body: t.body, documentJson: t.documentJson ?? "" });
      if (t.documentJson) { try { const parsed = JSON.parse(t.documentJson) as EmailDocument; if (parsed.version === 1 && Array.isArray(parsed.blocks)) { setDocument(parsed); setBuilderMode(true); } } catch { /* legacy body remains active */ } }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const loadSections = async () => { try { const result = await api<{ sections: typeof sections }>("/api/templates/sections"); setSections(result.sections); } catch (e) { notify(e instanceof Error ? e.message : "Sections failed", "error"); } };

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const insertVar = (v: string) => {
    setForm((f) => ({ ...f, body: f.body + v }));
  };

  const insertDynamic = () => {
    if (!dynamicValue.trim() || !dynamicContent.trim()) return;
    const document = { blocks: [{ when: [{ field: dynamicField, operator: "equals", value: dynamicValue.trim() }], content: dynamicContent.trim() }], fallback: form.body };
    setForm((current) => ({ ...current, body: `<!--clipreach-dynamic:${JSON.stringify(document)}-->` }));
    setDynamicMode(false);
    setDynamicValue("");
    setDynamicContent("");
  };

  const saveSection = async () => { if (!sectionName.trim()) return; try { await api("/api/templates/sections", { method: "POST", body: JSON.stringify({ name: sectionName, documentJson: JSON.stringify(document) }) }); setSectionName(""); await loadSections(); notify("Повторно используемый блок сохранён", "success"); } catch (e) { notify(e instanceof Error ? e.message : "Не удалось сохранить блок", "error"); } };
  const insertSection = (section: { documentJson: string }) => { try { const value = JSON.parse(section.documentJson) as EmailDocument; if (value.version === 1) { setDocument((current) => ({ ...current, blocks: [...current.blocks, ...value.blocks.map((block) => ({ ...block, id: `${block.id}-${Date.now()}` }))] })); setBuilderMode(true); } } catch { notify("Invalid reusable section", "error"); } };

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const result = await api<{ subject: string; html: string; text: string }>("/api/emails/preview", { method: "POST", body: JSON.stringify({ subject: form.subject, body: form.body, documentJson: builderMode ? JSON.stringify(document) : null, device: "desktop" }) });
      setPreview(result);
      const compatibilityResult = await api<{ issues: typeof compatibility }>("/api/emails/compatibility", { method: "POST", body: JSON.stringify({ html: result.html }) });
      setCompatibility(compatibilityResult.issues);
    } catch (e) { notify(e instanceof Error ? e.message : "Preview failed", "error"); }
    finally { setPreviewLoading(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/api/templates/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, documentJson: builderMode ? JSON.stringify(document) : null }),
      });
      notify("Template saved", "success");
      router.push("/templates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Удалить template "${form.name}"?`)) return;
    setDeleting(true);
    try {
      await api(`/api/templates/${params.id}`, { method: "DELETE" });
      notify("Template deleted", "success");
      router.push("/templates");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Удалить failed", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (error) return <div className="empty">{error}</div>;
  if (loading) return <div className="empty">Загрузка шаблона...</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Редактирование шаблона</h1>
          <p className="page-sub">Обновите шаблон письма.</p>
        </div>
        <Link href="/templates" className="btn">К шаблонам</Link>
      </div>

      <form className="card" style={{ maxWidth: 640, padding: 24 }} onSubmit={submit}>
        <div className="field">
          <label>Name *</label>
          <input className="input" value={form.name} onChange={set("name")} required placeholder="Partnership intro" />
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--surface-2)" }}>
          <div className="row"><div className="section-label grow">Конструктор письма</div><button type="button" className="btn btn-sm" onClick={() => setBuilderMode((value) => !value)}>{builderMode ? "Использовать обычный текст" : "Использовать конструктор"}</button></div>
          {builderMode && <BuilderPanel document={document} selectedBlock={selectedBlock} onSelect={setSelectedBlock} onChange={setDocument} />}
          {builderMode && <div className="stack" style={{ gap: 8, marginTop: 12 }}><div className="row"><input className="input grow" value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="Название блока" /><button type="button" className="btn btn-sm" onClick={saveSection} disabled={!sectionName.trim()}>Сохранить блок</button><button type="button" className="btn btn-sm" onClick={loadSections}>Загрузить блоки</button></div>{sections.map((section) => <button type="button" className="btn btn-sm" style={{ textAlign: "left" }} key={section.id} onClick={() => insertSection(section)}>Вставить: {section.name}</button>)}</div>}
          <div className="small muted" style={{ marginTop: 8 }}>Build with email-safe blocks. Legacy subject/body content remains available when builder mode is off.</div>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--surface-2)" }}>
          <div className="row"><div className="section-label grow">Предпросмотр письма</div><button type="button" className="btn btn-sm" onClick={loadPreview} disabled={previewLoading}>{previewLoading ? "Подготовка..." : "Предпросмотр на компьютере"}</button></div>
          {preview && <><div className="small muted" style={{ margin: "8px 0" }}>Тема: {preview.subject}</div><iframe title="Предпросмотр письма" sandbox="allow-same-origin" srcDoc={preview.html} style={{ width: "100%", height: 360, border: "1px solid var(--border)", borderRadius: 8, background: "white" }} /><details style={{ marginTop: 8 }}><summary className="small">Текстовая версия</summary><pre className="small" style={{ whiteSpace: "pre-wrap" }}>{preview.text}</pre></details></>}
          {compatibility.length > 0 && <div className="stack" style={{ gap: 5, marginTop: 8 }}>{compatibility.map((issue) => <div className="row small" key={`${issue.code}-${issue.client}`}><span className={`badge ${issue.severity === "error" ? "red" : "warm"}`}>{issue.severity}</span><span className="grow">{issue.message}</span><span className="muted">{issue.client}</span></div>)}</div>}
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--surface-2)" }}>
          <div className="row"><div className="section-label grow">Динамический контент</div><button type="button" className="btn btn-sm" onClick={() => setDynamicMode((value) => !value)}>{dynamicMode ? "Отмена" : "Добавить правило"}</button></div>
          {dynamicMode && <div className="stack" style={{ gap: 8, marginTop: 10 }}><div className="row"><select className="select grow" value={dynamicField} onChange={(e) => setDynamicField(e.target.value)}><option value="niche">Ниша</option><option value="company">Компания</option><option value="firstName">Имя</option></select><input className="input grow" value={dynamicValue} onChange={(e) => setDynamicValue(e.target.value)} placeholder="Значение, например SaaS" /></div><textarea className="input" rows={3} value={dynamicContent} onChange={(e) => setDynamicContent(e.target.value)} placeholder="Content shown when the rule matches" /><button type="button" className="btn btn-primary" onClick={insertDynamic}>Вставить динамический блок</button></div>}
          <div className="small muted" style={{ marginTop: 8 }}>A dynamic block is stored as safe JSON and rendered before sending. Existing plain-text templates remain unchanged.</div>
        </div>

        <div className="field">
          <label>Category</label>
          <select className="select" value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Subject *</label>
          <input className="input" value={form.subject} onChange={set("subject")} required placeholder="Partnership with {{company}}" />
        </div>

        <div className="field">
          <label>Body *</label>
          <textarea className="input" rows={8} value={form.body} onChange={set("body")} required placeholder="Hi {{firstName}},..." />
        </div>

        <div className="field">
          <label>Variables</label>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {VARIABLES.map((v) => (
              <span key={v} className="badge" style={{ cursor: "pointer", background: "var(--accent-muted)", color: "var(--accent)" }} onClick={() => insertVar(v)}>
                {v}
              </span>
            ))}
          </div>
        </div>

        {error && <div className="small" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}

        <div className="row" style={{ gap: 12 }}>
          <button className="btn btn-primary btn-lg grow" disabled={saving || deleting}>
            {saving ? "Saving..." : "Сохранить шаблон"}
          </button>
          <button type="button" className="btn btn-outline-danger btn-lg" disabled={saving || deleting} onClick={remove}>
            {deleting ? "Deleting..." : "Удалить"}
          </button>
        </div>
      </form>
    </div>
  );
}
