"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import BlurText from "@/components/react-bits/BlurText";
import FadeContent from "@/components/react-bits/FadeContent";

type FilterRow = { field: string; op: string; value: string };

const FIELDS = [
  { key: "status", label: "Status", ops: ["equals"] },
  { key: "score", label: "Score", ops: ["gt", "lt", "equals"] },
  { key: "name", label: "Name", ops: ["contains", "equals"] },
  { key: "email", label: "Email", ops: ["contains", "equals"] },
  { key: "companyOrChannel", label: "Company", ops: ["contains", "equals"] },
];

const STATUSES = ["New", "Analyzed", "Contacted", "Replied", "Interested", "Not Now", "Client", "Lost", "Unsubscribed"];

export default function NewSegmentPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<FilterRow[]>([{ field: "status", op: "equals", value: "" }]);
  const [preview, setPreview] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const addFilter = () => setFilters((f) => [...f, { field: "status", op: "equals", value: "" }]);
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, idx) => idx !== i));
  const setFilter = (i: number, key: keyof FilterRow, val: string) => {
    setFilters((f) => f.map((row, idx) => (idx === i ? { ...row, [key]: val, ...(key === "field" ? { op: FIELDS.find((x) => x.key === val)?.ops[0] || "equals" } : {}) } : row)));
  };

  const previewLeads = async () => {
    try {
      const active = filters.filter((f) => f.value.trim());
      if (!active.length) { setPreview(null); return; }
      let qs = "";
      for (const f of active) {
        if (f.field === "status" && f.value) qs += `&status=${encodeURIComponent(f.value)}`;
        if (f.field === "score" && f.value && f.op === "gt") qs += `&minScore=${encodeURIComponent(f.value)}`;
        if (f.field === "score" && f.value && f.op === "lt") qs += `&maxScore=${encodeURIComponent(f.value)}`;
        if (f.field === "name" && f.value) qs += `&q=${encodeURIComponent(f.value)}`;
        if (f.field === "email" && f.value) qs += `&q=${encodeURIComponent(f.value)}`;
        if (f.field === "companyOrChannel" && f.value) qs += `&q=${encodeURIComponent(f.value)}`;
      }
      const res = await api<{ leads: unknown[] }>(`/api/leads?${qs.replace(/^&/, "")}`);
      setPreview(res.leads.length);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Preview failed", "error");
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const stored = filters.filter((f) => f.value.trim()).map((f) => ({ field: f.field, op: f.op, value: f.value.trim() }));
      await api("/api/segments", {
        method: "POST",
        body: JSON.stringify({ name, description, filters: JSON.stringify(stored) }),
      });
      notify("Segment created", "success");
      router.push("/segments");
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
          <BlurText text="New Segment" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub">Define a reusable smart filter</p>
        </div>
        <Link href="/segments" className="btn btn-ghost">← Back</Link>
      </div>

      {error && <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--red)" }}>{error}</div>}

      <FadeContent>
        <form className="card" style={{ maxWidth: 620, padding: 24 }} onSubmit={submit}>
          <div className="field">
            <label>Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="YouTube creators 50k+" />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>

          <div className="section-label" style={{ marginTop: 8 }}>Filters</div>
          <div className="stack" style={{ gap: 8, marginBottom: 14 }}>
            {filters.map((f, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <select className="select" style={{ flex: 1 }} value={f.field} onChange={(e) => setFilter(i, "field", e.target.value)}>
                  {FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                <select className="select" style={{ flex: 0.6 }} value={f.op} onChange={(e) => setFilter(i, "op", e.target.value)}>
                  {FIELDS.find((x) => x.key === f.field)?.ops.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {f.field === "status" ? (
                  <select className="select" style={{ flex: 1 }} value={f.value} onChange={(e) => setFilter(i, "value", e.target.value)}>
                    <option value="">Any</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input className="input" style={{ flex: 1 }} value={f.value} onChange={(e) => setFilter(i, "value", e.target.value)} placeholder="value" />
                )}
                <button type="button" className="btn btn-sm btn-ghost-danger" onClick={() => removeFilter(i)}>✕</button>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={addFilter}>+ Add filter</button>
            <button type="button" className="btn btn-sm" onClick={previewLeads}>Preview</button>
            {preview !== null && <span className="small muted">{preview} matching lead(s)</span>}
          </div>

          <button className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 18 }} disabled={loading || !name.trim()}>
            {loading ? "Saving..." : "Create segment"}
          </button>
        </form>
      </FadeContent>
    </div>
  );
}