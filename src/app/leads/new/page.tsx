"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type FormState = {
  name: string;
  companyOrChannel: string;
  email: string;
  websiteUrl: string;
  youtubeUrl: string;
  niche: string;
  followersCount: string;
};

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: "", companyOrChannel: "", email: "", websiteUrl: "", youtubeUrl: "", niche: "", followersCount: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ lead: { id: string } }>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          companyOrChannel: form.companyOrChannel,
          email: form.email || null,
          websiteUrl: form.websiteUrl || null,
          youtubeUrl: form.youtubeUrl || null,
          niche: form.niche || null,
          followersCount: form.followersCount ? Number(form.followersCount) : null,
        }),
      });
      router.push(`/leads/${res.lead.id}`);
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
          <h1 className="page-title">Add a lead</h1>
          <p className="page-sub">Record a prospect, then analyze them with AI.</p>
        </div>
        <Link href="/leads" className="btn">Back to leads</Link>
      </div>

      <form className="card" style={{ maxWidth: 560, padding: 24 }} onSubmit={submit}>
        <div className="field">
          <label>Name *</label>
          <input className="input" value={form.name} onChange={set("name")} required placeholder="Alex Rivera" />
        </div>
        <div className="field">
          <label>Channel / Company</label>
          <input className="input" value={form.companyOrChannel} onChange={set("companyOrChannel")} placeholder="ALEX RIVERA (YouTube)" />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="alex@example.com" />
        </div>
        <div className="field">
          <label>YouTube URL</label>
          <input className="input" value={form.youtubeUrl} onChange={set("youtubeUrl")} placeholder="https://youtube.com/@channel" />
        </div>
        <div className="field">
          <label>Niche</label>
          <input className="input" value={form.niche} onChange={set("niche")} placeholder="Podcast / Education / Business" />
        </div>
        <div className="field">
          <label>Followers count</label>
          <input className="input" type="number" min={0} value={form.followersCount} onChange={set("followersCount")} placeholder="84000" />
        </div>

        {error && <div className="small" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Creating…" : "Create lead"}
        </button>
      </form>
    </div>
  );
}