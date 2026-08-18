"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";

const VARIABLES = ["{{firstName}}", "{{company}}", "{{website}}", "{{channel}}", "{{telegram}}"];

const CATEGORIES = ["Cold outreach", "Partnership", "YouTube", "Telegram", "Agency", "Follow-up", "Custom"];

export default function NewTemplatePage() {
  const router = useRouter();
  const { notify } = useToast();
  const [form, setForm] = useState({ name: "", category: "Cold outreach", subject: "", body: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const insertVar = (v: string) => {
    setForm((f) => ({ ...f, body: f.body + v }));
  };

  const generateWithAI = async () => {
    setAiLoading(true);
    try {
      const leads = await api<{ leads: Array<{ id: string }> }>("/api/leads");
      const leadId = leads.leads[0]?.id;
      if (!leadId) { notify("No leads available for AI generation", "error"); return; }
      const res = await api<{ email: { subject: string; body: string } }>("/api/emails/generate", {
        method: "POST",
        body: JSON.stringify({ leadId }),
      });
      setForm((f) => ({ ...f, subject: res.email.subject, body: res.email.body }));
      notify("AI generated content", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "AI generation failed", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/templates", {
        method: "POST",
        body: JSON.stringify(form),
      });
      router.push("/templates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Новый шаблон</h1>
          <p className="page-sub">Создайте шаблон письма для повторного использования.</p>
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

        <button type="button" className="btn" style={{ width: "100%", marginBottom: 12 }} disabled={aiLoading} onClick={generateWithAI}>
          {aiLoading ? <><span className="spinner" /> Создание...</> : "Создать с помощью ИИ"}
        </button>

        {error && <div className="small" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Создание..." : "Создать шаблон"}
        </button>
      </form>
    </div>
  );
}
