"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { ScoreBadge } from "@/components/ScoreBadge";
import { formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/StatusPill";
import { EmailCard } from "@/components/EmailCard";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import FadeContent from "@/components/react-bits/FadeContent";
import SpotlightCard from "@/components/react-bits/SpotlightCard";

type Insight = {
  opportunity: string;
  pitchAngle: string;
  suggestedOffer: string;
  suggestedTest: string;
  risk: string;
};

type Profile = {
  lead: {
    id: string;
    name: string;
    companyOrChannel: string;
    email: string | null;
    niche: string | null;
    youtubeUrl: string | null;
    leadScore: number;
    scores: Array<{ key: string; label: string; points: number; weight: number; reason: string }> | null;
    insight: Insight | null;
    status: string;
    nextFollowUpAt: string | null;
    createdAt: string;
  };
  emails: Array<{ id: string; subject: string; status: string; sentAt: string | null }>;
  followUps: Array<{ id: string; dueDate: string; status: string; note: string }>;
  replies: Array<{ id: string; classification: string; contentSnippet: string; receivedAt: string }>;
  activities: Array<{ id: string; type: string; payload: unknown; createdAt: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
};

export default function LeadProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [draft, setDraft] = useState<{ id: string; subject: string; body: string } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<Profile>(`/api/leads/${id}`);
      setData(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setNote("");
    try {
      await fn();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusy("");
    }
  };

  const analyze = () => run("analyzing", async () => {
    await api(`/api/ai/analyze`, { method: "POST", body: JSON.stringify({ leadId: id }) });
    await load();
  });

  const generate = () => run("generating", async () => {
    const res = await api<{ email: { id: string; subject: string; body: string } }>("/api/emails/generate", {
      method: "POST", body: JSON.stringify({ leadId: id }),
    });
    setDraft(res.email);
  });

  const setStatus = (status: string) => run("status", async () => {
    await api(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  });

  if (error) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">Загрузка лида…</div>;

  const lead = data.lead;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="row">
            <BlurText text={lead.name} className="page-title" delay={30} animateBy="words" />
            <StatusPill status={lead.status} />
            <ScoreBadge score={lead.leadScore} breakdown={lead.scores} />
          </div>
          <p className="page-sub"><ShinyText text={lead.companyOrChannel || lead.niche || ""} speed={3} /></p>
        </div>
        <Link href="/leads" className="btn">Назад</Link>
      </div>

      {note && <div className="card" style={{ padding: 12, marginBottom: 16, borderColor: "#ff4444", color: "#ff4444" }}>{note}</div>}

      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <FadeContent><section className="card" style={{ padding: 18 }}>
            <div className="section-label">Детали</div>
            <DetailRow label="Электронная почта" value={lead.email ?? "—"} />
            <DetailRow label="Канал" value={lead.companyOrChannel || "—"} />
            <DetailRow label="Niche" value={lead.niche || "—"} />
            <DetailRow label="YouTube" value={lead.youtubeUrl ?? "—"} />
            <DetailRow label="Создан" value={formatDate(lead.createdAt)} />
            <div className="divider" />
            <div className="row">
              <button className="btn btn-primary" onClick={analyze} disabled={!!busy}>
                {busy === "analyzing" ? <><span className="spinner" /> Анализ…</> : "Анализировать"}
              </button>
              <select className="select" style={{ maxWidth: 170 }} value="" onChange={(e) => e.target.value && setStatus(e.target.value)}>
                <option value="" disabled>Set status…</option>
                <option value="Client">Client</option>
                <option value="Lost">Lost</option>
                <option value="Not Now">Not Now</option>
                <option value="Unsubscribed">Unsubscribed</option>
              </select>
            </div>
          </section></FadeContent>

          {lead.insight && (
            <FadeContent><section className="card" style={{ padding: 18 }}>
              <div className="section-label">AI Insight</div>
              <InsightBlock insight={lead.insight} />
            </section></FadeContent>
          )}
        </div>
        <div>
          <SpotlightCard>
            <EmailCard
              draft={draft}
              busy={busy}
              onGenerate={generate}
              onDraftChange={setDraft}
              onSent={load}
            />
          </SpotlightCard>
        </div>
      </div>

      <div className="divider" />

      <div className="split">
        <section>
          <div className="section-label">Письма</div>
          <div className="card">
            {data.emails.length === 0 ? <div className="empty">Писем пока нет.</div> : data.emails.map((e) => (
              <div key={e.id} className="row" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                <span className="grow" style={{ fontWeight: 550 }}>{e.subject}</span>
                <span className={`badge ${e.status === "Sent" ? "green" : e.status === "Failed" ? "red" : "gray"}`}>{e.status}</span>
                <span className="small muted">{e.sentAt ? formatDate(e.sentAt) : ""}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="section-label">Повторные контакты</div>
          <div className="card">
            {data.followUps.length === 0 ? <div className="empty">Повторных контактов пока нет.</div> : data.followUps.map((f) => (
              <div key={f.id} className="row" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                <span className="grow" style={{ fontWeight: 550 }}>{f.note}</span>
                <span className="small muted">{formatDate(f.dueDate)}</span>
                <span className={`badge ${f.status === "Pending" ? "warm" : "gray"}`}>{f.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ padding: "4px 0", fontSize: 14 }}>
      <span className="muted" style={{ width: 90 }}>{label}</span>
      <span className="grow">{value}</span>
    </div>
  );
}

function InsightBlock({ insight }: { insight: Insight }) {
  return (
    <div className="stack">
      {[
        ["Opportunity", insight.opportunity],
        ["Pitch angle", insight.pitchAngle],
        ["Suggested offer", insight.suggestedOffer],
        ["Suggested test", insight.suggestedTest],
        ["Risk", insight.risk],
      ].map(([label, text]) => (
        <div key={label}>
          <div className="small" style={{ fontWeight: 650, marginBottom: 2 }}>{label}</div>
          <div className="insight-box">{text}</div>
        </div>
      ))}
    </div>
  );
}
