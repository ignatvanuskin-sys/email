"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";

const VARIABLES = ["{{firstName}}", "{{company}}", "{{website}}", "{{channel}}", "{{telegram}}"];

const CATEGORIES = ["Cold outreach", "Partnership", "YouTube", "Telegram", "Agency", "Follow-up", "Custom"];

type Template = {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
};

export default function EditTemplatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const [form, setForm] = useState({ name: "", category: "Cold outreach", subject: "", body: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await api<Template>(`/api/templates/${params.id}`);
      setForm({ name: t.name, category: t.category, subject: t.subject, body: t.body });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const insertVar = (v: string) => {
    setForm((f) => ({ ...f, body: f.body + v }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/api/templates/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
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
    if (!window.confirm(`Delete template "${form.name}"?`)) return;
    setDeleting(true);
    try {
      await api(`/api/templates/${params.id}`, { method: "DELETE" });
      notify("Template deleted", "success");
      router.push("/templates");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (error) return <div className="empty">{error}</div>;
  if (loading) return <div className="empty">Loading template...</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Edit template</h1>
          <p className="page-sub">Update your email template.</p>
        </div>
        <Link href="/templates" className="btn">Back to templates</Link>
      </div>

      <form className="card" style={{ maxWidth: 640, padding: 24 }} onSubmit={submit}>
        <div className="field">
          <label>Name *</label>
          <input className="input" value={form.name} onChange={set("name")} required placeholder="Partnership intro" />
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
            {saving ? "Saving..." : "Save template"}
          </button>
          <button type="button" className="btn btn-outline-danger btn-lg" disabled={saving || deleting} onClick={remove}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </form>
    </div>
  );
}