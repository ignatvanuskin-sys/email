"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import FadeContent from "@/components/react-bits/FadeContent";

type Option = { id: string; name: string };

type FormState = {
  name: string;
  description: string;
  dailyLimit: number;
  templateId: string;
  sequenceId: string;
  segmentId: string;
};

export default function NewCampaignPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [form, setForm] = useState<FormState>({ name: "", description: "", dailyLimit: 25, templateId: "", sequenceId: "", segmentId: "" });
  const [templates, setTemplates] = useState<Option[]>([]);
  const [sequences, setSequences] = useState<Option[]>([]);
  const [segments, setSegments] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState("");
  const [aiGoal, setAiGoal] = useState("");
  const [aiTone, setAiTone] = useState("warm and concise");
  const [aiLoading, setAiLoading] = useState(false);
  const [subjects, setSubjects] = useState<Array<{ text: string; angle: string }>>([]);
  const [draft, setDraft] = useState({ subject: "", preheader: "", body: "" });

  const loadOptions = useCallback(async () => {
    try {
      const [t, s, seg] = await Promise.all([
        api<{ templates: Option[] }>("/api/templates"),
        api<{ sequences: Option[] }>("/api/sequences"),
        api<{ segments: Option[] }>("/api/segments"),
      ]);
      setTemplates(t.templates);
      setSequences(s.sequences);
      setSegments(seg.segments);
    } catch {
      notify("Failed to load options", "error");
    } finally {
      setLoadingOptions(false);
    }
  }, [notify]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => {
    const val = k === "dailyLimit" ? Number(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: val }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ campaign: { id: string } }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          dailyLimit: form.dailyLimit,
          templateId: form.templateId || null,
          sequenceId: form.sequenceId || null,
          segmentId: form.segmentId || null,
        }),
      });
      notify("Campaign created", "success");
      router.push(`/campaigns/${res.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const generateDraft = async () => {
    setAiLoading(true);
    try {
      const result = await api<{ draft: { subject: string; body: string; preheader: string } }>("/api/ai/campaign-draft", { method: "POST", body: JSON.stringify({ goal: aiGoal, tone: aiTone, audience: form.description, offer: form.description }) });
      setDraft(result.draft);
      notify("Draft generated. Review it before using it in a template.", "success");
    } catch (e) { notify(e instanceof Error ? e.message : "AI generation failed", "error"); }
    finally { setAiLoading(false); }
  };

  const generateSubjects = async () => {
    setAiLoading(true);
    try {
      const result = await api<{ subjects: Array<{ text: string; angle: string }> }>("/api/ai/subjects", { method: "POST", body: JSON.stringify({ goal: aiGoal, tone: aiTone, audience: form.description, offer: form.description }) });
      setSubjects(result.subjects);
    } catch (e) { notify(e instanceof Error ? e.message : "Subject generation failed", "error"); }
    finally { setAiLoading(false); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Новая кампания" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text="Настройте параметры новой рассылки" speed={3} /></p>
        </div>
        <Link href="/campaigns" className="btn">Back to campaigns</Link>
      </div>

      <FadeContent>
        <form className="card" style={{ maxWidth: 560, padding: 24 }} onSubmit={submit}>
          <div className="field">
            <label>Name *</label>
            <input className="input" value={form.name} onChange={set("name")} required placeholder="Summer outreach" />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea className="input" rows={3} value={form.description} onChange={set("description")} placeholder="Describe the goal of this campaign" />
          </div>
          <div className="card" style={{ padding: 14, marginBottom: 16, background: "var(--surface-2)" }}>
            <div className="section-label">AI Campaign Copilot</div>
            <div className="field"><label>Campaign goal</label><textarea className="input" rows={2} value={aiGoal} onChange={(e) => setAiGoal(e.target.value)} placeholder="Announce the new product plan to active customers" /></div>
            <div className="field"><label>Tone of voice</label><input className="input" value={aiTone} onChange={(e) => setAiTone(e.target.value)} /></div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><button type="button" className="btn" onClick={generateDraft} disabled={aiLoading || aiGoal.length < 3}>{aiLoading ? "Generating..." : "Generate draft"}</button><button type="button" className="btn" onClick={generateSubjects} disabled={aiLoading || aiGoal.length < 3}>Generate 5–10 subjects</button></div>
            {subjects.length > 0 && <div className="stack" style={{ marginTop: 12, gap: 6 }}>{subjects.map((subject) => <button type="button" className="btn" key={subject.text} style={{ textAlign: "left" }} onClick={() => setForm((current) => ({ ...current, description: `${current.description}\nSubject: ${subject.text}` }))}><strong>{subject.text}</strong><span className="small muted"> · {subject.angle}</span></button>)}</div>}
            {draft.body && <div className="stack" style={{ marginTop: 12, gap: 8 }}><div className="field"><label>Generated subject</label><input className="input" value={draft.subject} onChange={(e) => setDraft((current) => ({ ...current, subject: e.target.value }))} /></div><div className="field"><label>Generated preheader</label><input className="input" value={draft.preheader} onChange={(e) => setDraft((current) => ({ ...current, preheader: e.target.value }))} /></div><div className="field"><label>Generated body</label><textarea className="input" rows={6} value={draft.body} onChange={(e) => setDraft((current) => ({ ...current, body: e.target.value }))} /></div><div className="small muted">The draft is not sent automatically. Save it as a template to use it in a campaign.</div></div>}
          </div>
          <div className="field">
            <label>Дневной лимит</label>
            <input className="input" type="number" min={1} value={form.dailyLimit} onChange={set("dailyLimit")} />
          </div>

          <div className="field">
            <label>Template</label>
            <select className="select" value={form.templateId} onChange={set("templateId")} disabled={loadingOptions}>
              <option value="">None</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sequence</label>
            <select className="select" value={form.sequenceId} onChange={set("sequenceId")} disabled={loadingOptions}>
              <option value="">None</option>
              {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Segment</label>
            <select className="select" value={form.segmentId} onChange={set("segmentId")} disabled={loadingOptions}>
              <option value="">All leads</option>
              {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {error && <div className="small" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}

          <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading || loadingOptions}>
            {loading ? "Creating..." : "Создать кампанию"}
          </button>
        </form>
      </FadeContent>
    </div>
  );
}
