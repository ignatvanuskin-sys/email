"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { normalizeDashboard, type Dashboard } from "@/lib/dashboard";
import { formatDate, formatDateTime } from "@/lib/utils";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { PageTransition } from "@/components/PageTransition";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import FadeContent from "@/components/react-bits/FadeContent";
import SpotlightCard from "@/components/react-bits/SpotlightCard";

const ACTIVITY_META: Record<string, { icon: string; cls: string; label: string }> = {
  LeadCreated: { icon: "✓", cls: "green", label: "Lead created" },
  LeadImported: { icon: "⇪", cls: "green", label: "Lead imported" },
  EmailGenerated: { icon: "✉", cls: "accent", label: "Email generated" },
  EmailApproved: { icon: "✓", cls: "blue", label: "Email approved" },
  EmailSent: { icon: "➤", cls: "gray", label: "Email sent" },
  StatusChanged: { icon: "↻", cls: "gray", label: "Status changed" },
  Analyzed: { icon: "◈", cls: "accent", label: "Lead analyzed" },
};

export default function HomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    api<unknown>("/api/dashboard")
      .then((response) => {
        if (active) setData(normalizeDashboard(response));
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
      });
    return () => { active = false; };
  }, []);

  if (error) return <div className="empty-state"><div className="es-sub" style={{ color: "var(--red)" }}>{error}</div></div>;

  if (!data) {
    return (
      <div>
        <div className="page-head">
          <div><div className="skeleton" style={{ width: 200, height: 30 }} /><div className="skeleton" style={{ width: 260, height: 14, marginTop: 8 }} /></div>
        </div>
        <div className="metric-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="metric"><div className="skeleton" style={{ width: 90, height: 12 }} /><div className="skeleton" style={{ width: 60, height: 28, marginTop: 8 }} /></div>)}
        </div>
        <div className="split">
          <div className="card" style={{ padding: 20 }}><div className="skeleton" style={{ height: 160 }} /></div>
          <div className="card" style={{ padding: 20 }}><div className="skeleton" style={{ height: 160 }} /></div>
        </div>
      </div>
    );
  }

  const c = data.counters;
  const kpis = [
    { label: "Leads", value: c.totalLeads, icon: "◈", accent: true },
    { label: "Emails sent", value: c.emailsSent, icon: "➤", suffix: "" },
    { label: "Reply rate", value: c.replyRate, icon: "💬", suffix: "%" },
    { label: "Qualified", value: c.qualified, icon: "✓", suffix: "" },
    { label: "Clients", value: c.clients, icon: "★", suffix: "" },
    { label: "New leads", value: c.newLeads, icon: "✦", suffix: "" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Dashboard" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub">
            <ShinyText text={c.pendingFollowUps === 0 ? "All caught up — no follow-ups due today." : `${c.pendingFollowUps} follow-up(s) pending for today.`} speed={3} shineColor="#a0a0b0" />
          </p>
        </div>
        <div className="row">
          <Link href="/leads/import" className="btn">⇪ Import leads</Link>
          <Link href="/leads/new" className="btn btn-primary">＋ Add lead</Link>
        </div>
      </div>

      <PageTransition>
        <div className="metric-grid stagger">
          {kpis.map((k) => (
            <div key={k.label} className="kpi">
              <div className="kpi-icon" style={k.accent ? undefined : { background: "var(--surface-2)", color: "var(--text-muted)" }} aria-hidden>{k.icon}</div>
              <div className="label">{k.label}</div>
              <div className="value"><AnimatedCounter value={k.value} suffix={k.suffix ?? ""} /></div>
            </div>
          ))}
        </div>
      </PageTransition>

      <FadeContent>
        <section style={{ marginBottom: 24 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Campaign analytics</div>
            <span className="grow" />
            <Link href="/campaigns" className="btn btn-sm btn-ghost">View campaigns</Link>
          </div>
          <div className="metric-grid">
            <div className="kpi">
              <div className="label">Campaigns</div>
              <div className="value"><AnimatedCounter value={data.analytics.totalCampaigns} /></div>
              <div className="small muted">{data.analytics.runningCampaigns} running</div>
            </div>
            <div className="kpi">
              <div className="label">Delivered</div>
              <div className="value"><AnimatedCounter value={data.analytics.delivered} /></div>
            </div>
            <div className="kpi">
              <div className="label">Bounced</div>
              <div className="value"><AnimatedCounter value={data.analytics.bounced} /></div>
            </div>
            <div className="kpi">
              <div className="label">Failed</div>
              <div className="value"><AnimatedCounter value={data.analytics.failed} /></div>
            </div>
            <div className="kpi">
              <div className="label">Unsubscribed</div>
              <div className="value"><AnimatedCounter value={data.analytics.unsubscribed} /></div>
            </div>
            <div className="kpi">
              <div className="label">Reply rate</div>
              <div className="value"><AnimatedCounter value={c.replyRate} suffix="%" /></div>
            </div>
          </div>
        </section>
      </FadeContent>

      <div className="split" style={{ alignItems: "start" }}>
        <section>
          <div className="section-label">Hot leads</div>
          <SpotlightCard className="card" spotlightColor="rgba(255, 92, 31, 0.18)">
            {data.hotLeads.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <div className="es-icon" aria-hidden>◈</div>
                <div className="es-title">No hot leads yet</div>
                <div className="es-sub">Analyze leads or import a batch to surface high-value prospects.</div>
              </div>
            ) : (
              data.hotLeads.map((l, i) => (
                <Link key={l.id} href={`/leads/${l.id}`} className="row surface-hover" style={{ padding: "13px 16px", borderBottom: i < data.hotLeads.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span className="grow" style={{ fontWeight: 600 }}>{l.name}</span>
                  <span className={`badge ${l.leadScore >= 80 ? "hot" : l.leadScore >= 50 ? "warm" : "cold"}`}>{l.leadScore}</span>
                </Link>
              ))
            )}
          </SpotlightCard>
        </section>

        <section>
          <div className="section-label">Follow-ups due today</div>
          <SpotlightCard className="card" spotlightColor="rgba(37, 99, 235, 0.16)">
            {data.dueFollowUps.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <div className="es-icon" aria-hidden>⏰</div>
                <div className="es-title">Nothing due</div>
                <div className="es-sub">No follow-ups are scheduled for today.</div>
              </div>
            ) : (
              data.dueFollowUps.map((f, i) => (
                <Link key={f.id} href={`/leads/${f.lead.id}`} className="row surface-hover" style={{ padding: "13px 16px", borderBottom: i < data.dueFollowUps.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{f.lead.name}</div>
                    <div className="small muted">{f.lead.companyOrChannel || ""}</div>
                  </div>
                  <div className="small muted">{formatDate(f.dueDate)}</div>
                </Link>
              ))
            )}
          </SpotlightCard>
        </section>
      </div>

      <FadeContent>
        <section>
          <div className="section-label">Activity feed</div>
          <div className="card" style={{ overflow: "hidden" }}>
            {data.activities.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <div className="es-icon" aria-hidden>⚡</div>
                <div className="es-title">No activity yet</div>
                <div className="es-sub">Import leads and generate emails — your recent actions will appear here.</div>
              </div>
            ) : (
              <div className="activity-feed">
                {data.activities.map((a) => {
                  const meta = ACTIVITY_META[a.type] ?? { icon: "•", cls: "gray", label: a.type };
                  return (
                    <div key={a.id} className="activity-item">
                      <span className={`activity-dot ${meta.cls}`} aria-hidden />
                      <div className="grow">
                        <div>
                          <strong>{meta.label}</strong>
                          {a.lead && <Link href={`/leads/${a.lead.id}`} className="muted" style={{ marginLeft: 6 }}>· {a.lead.name}</Link>}
                        </div>
                        <div className="small muted">{formatDateTime(a.createdAt)}</div>
                      </div>
                      <span aria-hidden style={{ color: "var(--text-faint)" }}>{meta.icon}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </FadeContent>

      <FadeContent>
        <section style={{ marginTop: 24 }}>
          <div className="section-label">Recent replies</div>
          <SpotlightCard className="card" spotlightColor="rgba(37, 99, 235, 0.14)">
            {data.recentReplies.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <div className="es-icon" aria-hidden>💬</div>
                <div className="es-title">No replies yet</div>
                <div className="es-sub">Replies will show up here as soon as someone responds.</div>
              </div>
            ) : (
              data.recentReplies.map((r, i) => (
                <div key={r.id} className="row" style={{ padding: "12px 16px", borderBottom: i < data.recentReplies.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div className="grow">{r.lead.name}<span className="small muted" style={{ marginLeft: 8 }}>· {formatDate(r.receivedAt)}</span></div>
                  <span className={`badge ${r.classification === "Positive" ? "green" : r.classification === "Negative" ? "red" : "gray"}`}>{r.classification}</span>
                </div>
              ))
            )}
          </SpotlightCard>
        </section>
      </FadeContent>
    </div>
  );
}

