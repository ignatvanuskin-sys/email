"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { formatDate } from "@/lib/utils";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import SpotlightCard from "@/components/react-bits/SpotlightCard";
import FadeContent from "@/components/react-bits/FadeContent";
import { PageTransition } from "@/components/PageTransition";

type Campaign = {
  id: string;
  name: string;
  description: string;
  status: string;
  dailyLimit: number;
  createdAt: string;
  activeVersionId?: string | null;
  approvalExpiresAt?: string | null;
};

type CampaignLead = {
  id: string;
  status: string;
  sentAt: string | null;
  lead: { id: string; name: string; email: string | null };
};

type CampaignVariant = {
  id: string;
  name: string;
  subject: string;
  sent: number;
  replies: number;
};

type Data = {
  campaign: Campaign;
  leads: CampaignLead[];
  variants: CampaignVariant[];
};
type Version = { id: string; version: number; contentHash: string; createdAt: string };
type Analytics = { totals: { sent: number; delivered: number; bounced: number; failed: number; opened: number; clicked: number; replied: number; unsubscribed: number }; rates: { openRate: number; clickRate: number; replyRate: number; bounceRate: number; unsubscribeRate: number }; heatmap: Array<{ elementId: string; url: string | null; clicks: number; uniqueEmails: number }>; byDay: Array<{ date: string; sent: number; opens: number; clicks: number; replies: number }> };
type Cohort = { cohort: string; contacts: number; active: number; purchases: number; revenue: number; retentionRate: number; revenuePerContact: number };

type PreflightIssue = { code: string; severity: "error" | "warning"; message: string; source?: string; field?: string };
type Preflight = { ready: boolean; errors: number; warnings: number; checkedAt: string; issues: PreflightIssue[] };

const STATUS_STYLES: Record<string, string> = {
  Draft: "gray",
  Running: "green",
  Paused: "warm",
  Completed: "blue",
  Stopped: "red",
};

const LEAD_STATUS_STYLES: Record<string, string> = {
  Pending: "gray",
  Sent: "green",
  Skipped: "warm",
  Bounced: "red",
  Replied: "blue",
  Unsubscribed: "red",
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const id = params.id;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [variantOpen, setVariantOpen] = useState(false);
  const [variantForm, setVariantForm] = useState({ name: "Variant B", subject: "", body: "" });
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [insights, setInsights] = useState<{ summary: string; recommendations: string[] } | null>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [approvalExpiresAt, setApprovalExpiresAt] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [optimization, setOptimization] = useState({ frequencyCap: "", frequencyWindowDays: "", sendTimeOptimization: false });

  const load = useCallback(async () => {
    try {
      const d = await api<Data>(`/api/campaigns/${id}`);
      setData(d);
      setNameDraft(d.campaign.name);
      setDescDraft(d.campaign.description);
      setActiveVersionId(d.campaign.activeVersionId ?? null);
      setApprovalExpiresAt(d.campaign.approvalExpiresAt ?? null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadVersions = async () => {
    try { const result = await api<{ versions: Version[] }>(`/api/campaigns/${id}/versions`); setVersions(result.versions); } catch (e) { notify(e instanceof Error ? e.message : "Versions failed", "error"); }
  };

  const createVersion = async () => {
    try { const result = await api<{ version: Version }>(`/api/campaigns/${id}/versions`, { method: "POST" }); await api(`/api/campaigns/${id}/versions/activate`, { method: "POST", body: JSON.stringify({ versionId: result.version.id }) }); setVersions((current) => [result.version, ...current]); setActiveVersionId(result.version.id); setApprovalExpiresAt(null); notify(`Version ${result.version.version} created. Approve it before starting.`, "info"); } catch (e) { notify(e instanceof Error ? e.message : "Version creation failed", "error"); }
  };

  const approveVersion = async () => {
    try { if (!activeVersionId) return; const result = await api<{ campaign: { approvalExpiresAt: string | null } }>(`/api/campaigns/${id}/approve`, { method: "POST" }); setApprovalExpiresAt(result.campaign.approvalExpiresAt); notify("Campaign version approved", "success"); } catch (e) { notify(e instanceof Error ? e.message : "Approval failed", "error"); }
  };

  const activateVersion = async (versionId: string) => {
    try { await api(`/api/campaigns/${id}/versions/activate`, { method: "POST", body: JSON.stringify({ versionId }) }); setActiveVersionId(versionId); setApprovalExpiresAt(null); notify("Version selected. Approve it before starting.", "info"); } catch (e) { notify(e instanceof Error ? e.message : "Version activation failed", "error"); }
  };

  const loadCohorts = async () => { try { const result = await api<{ cohorts: Cohort[] }>("/api/analytics/cohorts"); setCohorts(result.cohorts); } catch (e) { notify(e instanceof Error ? e.message : "Cohorts failed", "error"); } };
  const saveOptimization = async () => { try { await api(`/api/campaigns/${id}/optimization`, { method: "PATCH", body: JSON.stringify({ frequencyCap: optimization.frequencyCap ? Number(optimization.frequencyCap) : null, frequencyWindowDays: optimization.frequencyWindowDays ? Number(optimization.frequencyWindowDays) : null, sendTimeOptimization: optimization.sendTimeOptimization }) }); notify("Optimization settings saved", "success"); } catch (e) { notify(e instanceof Error ? e.message : "Optimization save failed", "error"); } };

  const act = async (action: string) => {
    setBusy(action);
    try {
      await api(`/api/campaigns/${id}/${action}`, { method: "POST" });
      notify(`Campaign ${action}ed`, "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy("");
    }
  };

  const runPreflight = async () => {
    setBusy("preflight");
    try {
      const result = await api<{ preflight: Preflight }>(`/api/campaigns/${id}/preflight`, { method: "POST" });
      setPreflight(result.preflight);
      notify(result.preflight.ready ? "Preflight пройден. Кампания готова к запуску." : "Исправьте блокирующие ошибки preflight.", result.preflight.ready ? "success" : "error");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Preflight failed", "error");
    } finally {
      setBusy("");
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsBusy(true);
    try {
      const result = await api<{ analytics: Analytics }>(`/api/campaigns/${id}/stats`);
      setAnalytics(result.analytics);
    } catch (e) { notify(e instanceof Error ? e.message : "Analytics failed", "error"); }
    finally { setAnalyticsBusy(false); }
  };

  const loadInsights = async () => {
    setAnalyticsBusy(true);
    try {
      const result = await api<{ analytics: Analytics; insights: { summary: string; recommendations: string[] } }>(`/api/campaigns/${id}/insights`, { method: "POST" });
      setAnalytics(result.analytics);
      setInsights(result.insights);
    } catch (e) { notify(e instanceof Error ? e.message : "AI insights failed", "error"); }
    finally { setAnalyticsBusy(false); }
  };

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      notify("Updated", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed", "error");
    }
  };

  const saveName = () => {
    if (nameDraft.trim() && nameDraft !== data?.campaign.name) {
      patch({ name: nameDraft });
    }
    setEditingName(false);
  };

  const saveDesc = () => {
    if (descDraft !== data?.campaign.description) {
      patch({ description: descDraft });
    }
    setEditingDesc(false);
  };

  const saveVariant = async () => {
    try {
      await api(`/api/campaigns/${id}/variants`, {
        method: "POST",
        body: JSON.stringify(variantForm),
      });
      notify("Variant added", "success");
      setVariantOpen(false);
      setVariantForm({ name: "Variant B", subject: "", body: "" });
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to add variant", "error");
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-head"><div><h1 className="page-title">Campaign</h1></div></div>
        <div className="card" style={{ padding: 24 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 40, marginBottom: 10 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="page-head"><div><h1 className="page-title">Campaign</h1></div></div>
        <div className="card" style={{ padding: 12, color: "var(--red)" }}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { campaign, leads, variants } = data;
  const stats = {
    total: leads.length,
    sent: leads.filter((l) => l.status === "Sent").length,
    replied: leads.filter((l) => l.status === "Replied").length,
    bounced: leads.filter((l) => l.status === "Bounced").length,
    unsubscribed: leads.filter((l) => l.status === "Unsubscribed").length,
  };

  return (
    <PageTransition>
      <div>
        <div className="page-head">
          <div>
            <div className="row">
              {editingName ? (
                <input
                  className="input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  autoFocus
                  style={{ fontSize: 22, fontWeight: 650, maxWidth: 400 }}
                />
              ) : (
                <div style={{ cursor: "pointer" }} onClick={() => setEditingName(true)}>
                  <BlurText
                    text={campaign.name}
                    className="page-title"
                    delay={30}
                    animateBy="words"
                  />
                </div>
              )}
              <span className={`badge ${STATUS_STYLES[campaign.status] || "gray"}`}>{campaign.status}</span>
            </div>
            {editingDesc ? (
              <textarea
                className="input"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={saveDesc}
                autoFocus
                rows={2}
                style={{ maxWidth: 400, marginTop: 4 }}
              />
            ) : (
              <p className="page-sub" style={{ cursor: "pointer" }} onClick={() => setEditingDesc(true)}>
                <ShinyText text={campaign.description || "No description — click to add"} speed={3} />
              </p>
            )}
          </div>
          <Link href="/campaigns" className="btn">Back</Link>
        </div>

        <FadeContent>
          <SpotlightCard>
            <div className="card" style={{ padding: 20 }}>
              <div className="row" style={{ gap: 32, flexWrap: "wrap" }}>
                <StatBox label="Total leads" value={stats.total} />
                <StatBox label="Sent" value={stats.sent} />
                <StatBox label="Replied" value={stats.replied} />
                <StatBox label="Bounced" value={stats.bounced} />
                <StatBox label="Unsubscribed" value={stats.unsubscribed} />
              </div>
              <div className="divider" />
              <div className="row" style={{ gap: 8, fontSize: 14, color: "var(--muted)" }}>
                <span>Дневной лимит: {campaign.dailyLimit}</span>
                <span aria-hidden>|</span>
                <span>Created: {formatDate(campaign.createdAt)}</span>
              </div>
            </div>
          </SpotlightCard>
        </FadeContent>

        <div className="row" style={{ gap: 8, margin: "16px 0" }}>
          {(campaign.status === "Draft" || campaign.status === "Paused") && <><button className="btn" onClick={loadVersions}>Load versions</button><button className="btn" onClick={createVersion}>Create version</button><button className="btn" onClick={approveVersion} disabled={!activeVersionId}>Approve version</button></>}
          {(campaign.status === "Draft" || campaign.status === "Paused") && (
            <button className="btn" onClick={runPreflight} disabled={!!busy}>
              {busy === "preflight" ? <><span className="spinner" /> Checking...</> : "Run preflight"}
            </button>
          )}
          {campaign.status === "Draft" && (
            <button className="btn btn-primary" onClick={() => act("start")} disabled={!!busy}>
              {busy === "start" ? <><span className="spinner" /> Starting...</> : "Start"}
            </button>
          )}
          {campaign.status === "Running" && (
            <>
              <button className="btn" onClick={() => act("pause")} disabled={!!busy}>
                {busy === "pause" ? <><span className="spinner" /> Pausing...</> : "Pause"}
              </button>
              <button className="btn btn-outline-danger" onClick={() => act("stop")} disabled={!!busy}>
                {busy === "stop" ? <><span className="spinner" /> Stopping...</> : "Stop"}
              </button>
              <button className="btn" onClick={() => act("send")} disabled={!!busy} style={{ marginLeft: "auto" }}>
                {busy === "send" ? <><span className="spinner" /> Sending...</> : "Send batch"}
              </button>
            </>
          )}
          {campaign.status === "Paused" && (
            <>
              <button className="btn btn-primary" onClick={() => act("start")} disabled={!!busy}>
                {busy === "start" ? <><span className="spinner" /> Resuming...</> : "Resume"}
              </button>
              <button className="btn btn-outline-danger" onClick={() => act("stop")} disabled={!!busy}>
                {busy === "stop" ? <><span className="spinner" /> Stopping...</> : "Stop"}
              </button>
            </>
          )}
        </div>

        {versions.length > 0 && <section className="card" style={{ padding: 14, marginBottom: 20 }}><div className="row"><div className="section-label grow">Campaign versions</div>{approvalExpiresAt && <span className="badge green">Approved until {new Date(approvalExpiresAt).toLocaleTimeString()}</span>}</div><div className="stack" style={{ gap: 6, marginTop: 8 }}>{versions.map((version) => <button type="button" className="row small" key={version.id} style={{ textAlign: "left", border: 0, background: version.id === activeVersionId ? "var(--accent-muted)" : "transparent", padding: 8, borderRadius: 6 }} onClick={() => activateVersion(version.id)}><span className="grow">Version {version.version}</span><span className="muted">{new Date(version.createdAt).toLocaleString()}</span><code>{version.contentHash.slice(0, 10)}</code></button>)}</div></section>}

        {(campaign.status === "Draft" || campaign.status === "Paused") && <section className="card" style={{ padding: 14, marginBottom: 20 }}><div className="section-label">Send optimization</div><div className="row" style={{ alignItems: "end", gap: 8 }}><div className="field"><label>Max messages</label><input className="input" type="number" min={1} value={optimization.frequencyCap} onChange={(e) => setOptimization((current) => ({ ...current, frequencyCap: e.target.value }))} placeholder="No cap" /></div><div className="field"><label>Window (days)</label><input className="input" type="number" min={1} value={optimization.frequencyWindowDays} onChange={(e) => setOptimization((current) => ({ ...current, frequencyWindowDays: e.target.value }))} placeholder="7" /></div><label className="row small" style={{ paddingBottom: 8 }}><input type="checkbox" checked={optimization.sendTimeOptimization} onChange={(e) => setOptimization((current) => ({ ...current, sendTimeOptimization: e.target.checked }))} /> Optimize send time</label><button className="btn btn-primary" onClick={saveOptimization}>Save</button></div><div className="small muted">Contacts over the cap are skipped for this batch. Journey contacts are deferred until the next allowed time.</div></section>}

        {preflight && (
          <section className="card" style={{ padding: 18, marginBottom: 20, borderColor: preflight.ready ? "var(--green)" : "var(--red)" }}>
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="grow">
                <div className="section-label" style={{ marginBottom: 2 }}>Campaign preflight</div>
                <div className="small muted">Checked {new Date(preflight.checkedAt).toLocaleString()} · {preflight.errors} errors · {preflight.warnings} warnings</div>
              </div>
              <span className={`badge ${preflight.ready ? "green" : "red"}`}>{preflight.ready ? "Ready" : "Blocked"}</span>
            </div>
            {preflight.issues.length === 0 ? <div className="small">No issues found.</div> : <div className="stack" style={{ gap: 8 }}>
              {preflight.issues.map((issue, index) => (
                <div className="row small" key={`${issue.code}-${issue.source ?? "campaign"}-${index}`} style={{ alignItems: "start" }}>
                  <span className={`badge ${issue.severity === "error" ? "red" : "warm"}`}>{issue.severity}</span>
                  <div><div>{issue.message}</div>{issue.source && <div className="muted">Source: {issue.source}</div>}</div>
                </div>
              ))}
            </div>}
          </section>
        )}

        <section className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div className="row" style={{ marginBottom: 14 }}><div className="section-label grow" style={{ marginBottom: 0 }}>Campaign intelligence</div><button className="btn btn-sm" onClick={loadAnalytics} disabled={analyticsBusy}>{analyticsBusy ? "Loading..." : "Refresh"}</button><button className="btn btn-sm btn-primary" onClick={loadInsights} disabled={analyticsBusy}>AI insights</button></div>
          {!analytics ? <div className="small muted">Load analytics after sending begins.</div> : <>
            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}><Metric label="Открытия" value={`${analytics.rates.openRate}%`} /><Metric label="Переходы" value={`${analytics.rates.clickRate}%`} /><Metric label="Ответы" value={`${analytics.rates.replyRate}%`} /><Metric label="Возвраты" value={`${analytics.rates.bounceRate}%`} /></div>
            <div className="divider" />
            <div className="section-label">Click heatmap</div>
            {analytics.heatmap.length === 0 ? <div className="small muted">No click events yet. Link rewriting will be enabled with the HTML editor.</div> : <div className="stack" style={{ gap: 6 }}>{analytics.heatmap.map((item) => <div className="row small" key={item.elementId}><span className="grow" style={{ overflowWrap: "anywhere" }}>{item.url || item.elementId}</span><span className="badge blue">{item.clicks} clicks</span><span className="muted">{item.uniqueEmails} unique</span></div>)}</div>}
            {analytics.byDay.length > 0 && <><div className="divider" /><div className="section-label">Daily trend</div><div className="stack" style={{ gap: 6 }}>{analytics.byDay.map((day) => <div className="row small" key={day.date}><span className="grow">{day.date}</span><span>{day.sent} sent</span><span>{day.opens} opens</span><span>{day.clicks} clicks</span><span>{day.replies} replies</span></div>)}</div></>}
            {insights && <div className="card" style={{ padding: 12, marginTop: 14, background: "var(--surface-2)" }}><strong>AI summary</strong><p className="small">{insights.summary}</p><ul className="small">{insights.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul></div>}
          </>}
        </section>

        <section className="card" style={{ padding: 18, marginBottom: 20 }}><div className="row"><div className="section-label grow">Cohorts and revenue</div><button className="btn btn-sm" onClick={loadCohorts}>Load cohorts</button></div>{cohorts.length === 0 ? <div className="small muted">Track contact.created and purchase events to see retention and revenue.</div> : <div className="stack" style={{ gap: 6, marginTop: 8 }}>{cohorts.map((cohort) => <div className="row small" key={cohort.cohort}><span className="grow">{cohort.cohort}</span><span>{cohort.contacts} contacts</span><span>{cohort.retentionRate}% retention</span><span>{cohort.purchases} purchases</span><span>{cohort.revenue.toFixed(2)} revenue</span><span>{cohort.revenuePerContact.toFixed(2)}/contact</span></div>)}</div>}</section>

        {variants.length > 0 && (
          <FadeContent>
            <section style={{ marginBottom: 20 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <div className="section-label" style={{ marginBottom: 0 }}>A/B Variants</div>
                <span className="grow" />
                <button className="btn btn-sm" onClick={() => setVariantOpen(true)}>+ Добавить вариант</button>
              </div>
              <div className="card" style={{ padding: 0 }}>
                {variants.map((v) => (
                  <div key={v.id} className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{v.name}</div>
                      <div className="small muted">{v.subject}</div>
                    </div>
                    <span className="small muted">{v.sent} sent</span>
                    <span className="small muted" style={{ marginLeft: 12 }}>{v.replies} replies</span>
                  </div>
                ))}
              </div>
            </section>
          </FadeContent>
        )}

        {variantOpen && (
          <div className="modal-overlay" onClick={() => setVariantOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="section-label" style={{ marginBottom: 12 }}>Add A/B variant</div>
              <div className="field">
                <label>Variant name</label>
                <input className="input" value={variantForm.name} onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })} placeholder="Variant B" />
              </div>
              <div className="field">
                <label>Subject</label>
                <input className="input" value={variantForm.subject} onChange={(e) => setVariantForm({ ...variantForm, subject: e.target.value })} placeholder="Different subject line" />
              </div>
              <div className="field">
                <label>Body</label>
                <textarea className="input" rows={6} value={variantForm.body} onChange={(e) => setVariantForm({ ...variantForm, body: e.target.value })} placeholder="Different email body" />
              </div>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setVariantOpen(false)}>Отмена</button>
                <button className="btn btn-primary" disabled={!variantForm.subject.trim() || !variantForm.body.trim()} onClick={saveVariant}>Save variant</button>
              </div>
            </div>
          </div>
        )}

        <FadeContent>
          <section>
            <div className="section-label">Leads</div>
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              {leads.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <div className="es-title">No leads yet</div>
                  <div className="es-sub">Leads will appear here once the campaign starts.</div>
                </div>
              ) : (
                <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "10px 16px" }}>Name</th>
                      <th style={{ padding: "10px 16px" }}>Email</th>
                      <th style={{ padding: "10px 16px" }}>Status</th>
                      <th style={{ padding: "10px 16px" }}>Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((cl) => (
                      <tr key={cl.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => router.push(`/leads/${cl.lead.id}`)}>
                        <td style={{ padding: "10px 16px", fontWeight: 550 }}>{cl.lead.name}</td>
                        <td style={{ padding: "10px 16px" }}>{cl.lead.email || "—"}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span className={`badge ${LEAD_STATUS_STYLES[cl.status] || "gray"}`}>{cl.status}</span>
                        </td>
                        <td style={{ padding: "10px 16px" }} className="small muted">{cl.sentAt ? formatDate(cl.sentAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </FadeContent>
      </div>
    </PageTransition>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="grow" style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div className="small muted">{label}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="grow" style={{ minWidth: 100 }}><div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div><div className="small muted">{label}</div></div>; }
