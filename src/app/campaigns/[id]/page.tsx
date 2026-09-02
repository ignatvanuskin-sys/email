"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { formatDate, formatDateTime } from "@/lib/utils";
import { campaignLeadStatusLabels, uiLabel } from "@/lib/uiLabels";
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

const PREFLIGHT_MESSAGES: Record<string, string> = {
  provider_missing: "Подключите активный почтовый провайдер перед запуском рассылки.",
  from_missing: "Укажите корректный адрес отправителя в настройках почты.",
  domain_not_added: "Добавьте домен отправителя в центр доставляемости и опубликуйте SPF, DKIM и DMARC.",
  domain_unverified: "Домен отправителя ещё не прошёл полную проверку.",
  content_missing: "Выберите шаблон, добавьте шаг цепочки или создайте вариант A/B.",
  subject_missing: "Укажите тему письма.",
  body_missing: "Добавьте текст письма.",
  subject_long: "Тема длиннее 120 символов и может быть обрезана.",
  text_version_missing: "В HTML-письме нет содержательной текстовой версии.",
  unsafe_html: "Небезопасный HTML или скрипты нельзя использовать в письме.",
  image_alt_missing: "Добавьте alt-текст к изображениям для доступности.",
  spam_trigger: "Формулировка может вызвать срабатывание спам-фильтров.",
  subject_spam_style: "Избыток знаков препинания или заглавных букв в теме может ухудшить доставляемость.",
  unsubscribe_injected: "В черновике нет ссылки для отписки — при отправке ClipReach добавит подписанную ссылку.",
};

function localizePreflightIssue(issue: PreflightIssue): string {
  if (PREFLIGHT_MESSAGES[issue.code]) return PREFLIGHT_MESSAGES[issue.code];
  if (issue.code === "invalid_merge_tag") {
    const variable = issue.message.match(/\{\{[^}]+\}\}/)?.[0];
    return variable ? `Недопустимая переменная шаблона: ${variable}` : "Недопустимая переменная шаблона.";
  }
  if (issue.code === "broken_link") {
    const link = issue.message.match(/https?:\/\/\S+/)?.[0];
    return link ? `Ссылка недоступна: ${link}` : "Одна из ссылок в письме недоступна.";
  }
  return "Проверка выявила проблему в этом пункте.";
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const id = params.id;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editingИмя, setEditingИмя] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameDraft, setИмяDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [variantOpen, setVariantOpen] = useState(false);
  const [variantForm, setVariantForm] = useState({ name: "Вариант B", subject: "", body: "" });
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
      setИмяDraft(d.campaign.name);
      setDescDraft(d.campaign.description);
      setActiveVersionId(d.campaign.activeVersionId ?? null);
      setApprovalExpiresAt(d.campaign.approvalExpiresAt ?? null);
      setError("");
    } catch (e) {
      setError("Не удалось загрузить рассылку. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadVersions = async () => {
    try { const result = await api<{ versions: Version[] }>(`/api/campaigns/${id}/versions`); setVersions(result.versions); } catch { notify("Не удалось загрузить версии рассылки.", "error"); }
  };

  const createVersion = async () => {
    try { const result = await api<{ version: Version }>(`/api/campaigns/${id}/versions`, { method: "POST" }); await api(`/api/campaigns/${id}/versions/activate`, { method: "POST", body: JSON.stringify({ versionId: result.version.id }) }); setVersions((current) => [result.version, ...current]); setActiveVersionId(result.version.id); setApprovalExpiresAt(null); notify(`Версия ${result.version.version} создана. Одобрите её перед запуском.`, "info"); } catch (e) { notify("Не удалось создать версию рассылки.", "error"); }
  };

  const approveVersion = async () => {
    try { if (!activeVersionId) return; const result = await api<{ campaign: { approvalExpiresAt: string | null } }>(`/api/campaigns/${id}/approve`, { method: "POST" }); setApprovalExpiresAt(result.campaign.approvalExpiresAt); notify("Версия рассылки одобрена.", "success"); } catch { notify("Не удалось одобрить версию.", "error"); }
  };

  const activateVersion = async (versionId: string) => {
    try { await api(`/api/campaigns/${id}/versions/activate`, { method: "POST", body: JSON.stringify({ versionId }) }); setActiveVersionId(versionId); setApprovalExpiresAt(null); notify("Версия выбрана. Одобрите её перед запуском.", "info"); } catch { notify("Не удалось выбрать версию.", "error"); }
  };

  const loadCohorts = async () => { try { const result = await api<{ cohorts: Cohort[] }>("/api/analytics/cohorts"); setCohorts(result.cohorts); } catch { notify("Не удалось загрузить статистику по группам.", "error"); } };
  const saveOptimization = async () => { try { await api(`/api/campaigns/${id}/optimization`, { method: "PATCH", body: JSON.stringify({ frequencyCap: optimization.frequencyCap ? Number(optimization.frequencyCap) : null, frequencyWindowDays: optimization.frequencyWindowDays ? Number(optimization.frequencyWindowDays) : null, sendTimeOptimization: optimization.sendTimeOptimization }) }); notify("Настройки оптимизации сохранены.", "success"); } catch { notify("Не удалось сохранить настройки оптимизации.", "error"); } };

  const act = async (action: string) => {
    setBusy(action);
    try {
      await api(`/api/campaigns/${id}/${action}`, { method: "POST" });
      const actionMessage: Record<string, string> = { start: "Рассылка запущена.", pause: "Рассылка приостановлена.", stop: "Рассылка остановлена.", send: "Письма поставлены в очередь." };
      notify(actionMessage[action] ?? "Действие выполнено.", "success");
      await load();
    } catch (e) {
      notify("Не удалось выполнить действие. Проверьте настройки рассылки.", "error");
    } finally {
      setBusy("");
    }
  };

  const runPreflight = async () => {
    setBusy("preflight");
    try {
      const result = await api<{ preflight: Preflight }>(`/api/campaigns/${id}/preflight`, { method: "POST" });
      setPreflight(result.preflight);
      notify(result.preflight.ready ? "Проверка пройдена. Рассылка готова к запуску." : "Исправьте ошибки, блокирующие запуск.", result.preflight.ready ? "success" : "error");
    } catch (e) {
      notify("Не удалось проверить рассылку.", "error");
    } finally {
      setBusy("");
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsBusy(true);
    try {
      const result = await api<{ analytics: Analytics }>(`/api/campaigns/${id}/stats`);
      setAnalytics(result.analytics);
    } catch (e) { notify("Не удалось загрузить аналитику.", "error"); }
    finally { setAnalyticsBusy(false); }
  };

  const loadInsights = async () => {
    setAnalyticsBusy(true);
    try {
      const result = await api<{ analytics: Analytics; insights: { summary: string; recommendations: string[] } }>(`/api/campaigns/${id}/insights`, { method: "POST" });
      setAnalytics(result.analytics);
      setInsights(result.insights);
    } catch (e) { notify("Не удалось подготовить рекомендации.", "error"); }
    finally { setAnalyticsBusy(false); }
  };

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      notify("Изменения сохранены.", "success");
      await load();
    } catch (e) {
      notify("Не удалось сохранить изменения.", "error");
    }
  };

  const saveИмя = () => {
    if (nameDraft.trim() && nameDraft !== data?.campaign.name) {
      patch({ name: nameDraft });
    }
    setEditingИмя(false);
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
      notify("Вариант добавлен.", "success");
      setVariantOpen(false);
      setVariantForm({ name: "Вариант B", subject: "", body: "" });
      await load();
    } catch (e) {
      notify("Не удалось добавить вариант.", "error");
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-head"><div><h1 className="page-title">Рассылка</h1></div></div>
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
        <div className="page-head"><div><h1 className="page-title">Рассылка</h1></div></div>
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
              {editingИмя ? (
                <input
                  className="input"
                  value={nameDraft}
                  onChange={(e) => setИмяDraft(e.target.value)}
                  onBlur={saveИмя}
                  onKeyDown={(e) => e.key === "Enter" && saveИмя()}
                  autoFocus
                  style={{ fontSize: 22, fontWeight: 650, maxWidth: 400 }}
                />
              ) : (
                <div style={{ cursor: "pointer" }} onClick={() => setEditingИмя(true)}>
                  <BlurText
                    text={campaign.name}
                    className="page-title"
                    delay={30}
                    animateBy="words"
                  />
                </div>
              )}
              <span className={`badge ${STATUS_STYLES[campaign.status] || "gray"}`}>{({ Draft: "Черновик", Scheduled: "Запланирована", Running: "Запущена", Paused: "Приостановлена", Completed: "Завершена", Stopped: "Остановлена" } as Record<string, string>)[campaign.status] ?? campaign.status}</span>
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
                <ShinyText text={campaign.description || "Добавьте описание — нажмите, чтобы изменить"} speed={3} />
              </p>
            )}
          </div>
          <Link href="/campaigns" className="btn">Назад к кампаниям</Link>
        </div>

        <FadeContent>
          <SpotlightCard>
            <div className="card" style={{ padding: 20 }}>
              <div className="row" style={{ gap: 32, flexWrap: "wrap" }}>
                <StatBox label="Всего лидов" value={stats.total} />
                <StatBox label="Отправлено" value={stats.sent} />
                <StatBox label="Ответили" value={stats.replied} />
                <StatBox label="Возвраты" value={stats.bounced} />
                <StatBox label="Отписались" value={stats.unsubscribed} />
              </div>
              <div className="divider" />
              <div className="row" style={{ gap: 8, fontSize: 14, color: "var(--muted)" }}>
                <span>Дневной лимит: {campaign.dailyLimit}</span>
                <span aria-hidden>|</span>
                <span>Создана: {formatDate(campaign.createdAt)}</span>
              </div>
            </div>
          </SpotlightCard>
        </FadeContent>

        <section className="next-step-card">
          <div className="next-step-number">{campaign.status === "Draft" ? "1" : campaign.status === "Running" ? "3" : "2"}</div>
          <div className="grow"><div className="section-label">Следующий шаг</div><strong>{campaign.status === "Draft" ? "Проверьте кампанию и одобрите версию" : campaign.status === "Running" ? "Кампания запущена — отправьте следующую партию" : "Возобновите кампанию, когда будете готовы"}</strong><p className="small muted">{campaign.status === "Draft" ? "Сначала создайте версию, запустите проверку и только потом начинайте отправку." : "Все действия выполняются вручную. Письма не отправляются без вашего подтверждения."}</p></div>
        </section>
        <div className="row campaign-actions" style={{ gap: 8, margin: "16px 0" }}>
          {(campaign.status === "Draft" || campaign.status === "Paused") && <><button className="btn" onClick={loadVersions}>Загрузить версии</button><button className="btn" onClick={createVersion}>Создать версию</button><button className="btn" onClick={approveVersion} disabled={!activeVersionId}>Одобрить версию</button></>}
          {(campaign.status === "Draft" || campaign.status === "Paused") && (
            <button className="btn" onClick={runPreflight} disabled={!!busy}>
              {busy === "preflight" ? <><span className="spinner" /> Проверка...</> : "Проверить кампанию"}
            </button>
          )}
          {campaign.status === "Draft" && (
            <button className="btn btn-primary" onClick={() => act("start")} disabled={!!busy}>
              {busy === "start" ? <><span className="spinner" /> Запуск...</> : "Запустить кампанию"}
            </button>
          )}
          {campaign.status === "Running" && (
            <>
              <button className="btn" onClick={() => act("pause")} disabled={!!busy}>
                {busy === "pause" ? <><span className="spinner" /> Пауза...</> : "Пауза"}
              </button>
              <button className="btn btn-outline-danger" onClick={() => act("stop")} disabled={!!busy}>
                {busy === "stop" ? <><span className="spinner" /> Остановка...</> : "Остановить"}
              </button>
              <button className="btn" onClick={() => act("send")} disabled={!!busy} style={{ marginLeft: "auto" }}>
                {busy === "send" ? <><span className="spinner" /> Отправка...</> : "Отправить партию"}
              </button>
            </>
          )}
          {campaign.status === "Paused" && (
            <>
              <button className="btn btn-primary" onClick={() => act("start")} disabled={!!busy}>
                {busy === "start" ? <><span className="spinner" /> Возобновление...</> : "Возобновить"}
              </button>
              <button className="btn btn-outline-danger" onClick={() => act("stop")} disabled={!!busy}>
                {busy === "stop" ? <><span className="spinner" /> Остановка...</> : "Остановить"}
              </button>
            </>
          )}
        </div>

        {versions.length > 0 && <section className="card" style={{ padding: 14, marginBottom: 20 }}><div className="row"><div className="section-label grow">Версии кампании</div>{approvalExpiresAt && <span className="badge green">Одобрено до {formatDateTime(approvalExpiresAt)}</span>}</div><div className="stack" style={{ gap: 6, marginTop: 8 }}>{versions.map((version) => <button type="button" className="row small" key={version.id} style={{ textAlign: "left", border: 0, background: version.id === activeVersionId ? "var(--accent-muted)" : "transparent", padding: 8, borderRadius: 6 }} onClick={() => activateVersion(version.id)}><span className="grow">Версия {version.version}</span><span className="muted">{formatDateTime(version.createdAt)}</span></button>)}</div></section>}

        {(campaign.status === "Draft" || campaign.status === "Paused") && <section className="card" style={{ padding: 14, marginBottom: 20 }}><div className="section-label">Оптимизация отправки</div><div className="row" style={{ alignItems: "end", gap: 8 }}><div className="field"><label>Максимум сообщений</label><input className="input" type="number" min={1} value={optimization.frequencyCap} onChange={(e) => setOptimization((current) => ({ ...current, frequencyCap: e.target.value }))} placeholder="Без ограничения" /></div><div className="field"><label>Окно (дни)</label><input className="input" type="number" min={1} value={optimization.frequencyWindowDays} onChange={(e) => setOptimization((current) => ({ ...current, frequencyWindowDays: e.target.value }))} placeholder="7" /></div><label className="row small" style={{ paddingBottom: 8 }}><input type="checkbox" checked={optimization.sendTimeOptimization} onChange={(e) => setOptimization((current) => ({ ...current, sendTimeOptimization: e.target.checked }))} /> Оптимизировать время отправки</label><button className="btn btn-primary" onClick={saveOptimization}>Сохранить</button></div><div className="small muted">Контакты сверх лимита пропускаются в этой партии. Контакты из цепочек переносятся на ближайшее разрешённое время.</div></section>}

        {preflight && (
          <section className="card" style={{ padding: 18, marginBottom: 20, borderColor: preflight.ready ? "var(--green)" : "var(--red)" }}>
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="grow">
                <div className="section-label" style={{ marginBottom: 2 }}>Проверка кампании</div>
                <div className="small muted">Проверено {formatDateTime(preflight.checkedAt)} · ошибок: {preflight.errors} · предупреждений: {preflight.warnings}</div>
              </div>
              <span className={`badge ${preflight.ready ? "green" : "red"}`}>{preflight.ready ? "Готово" : "Заблокировано"}</span>
            </div>
            {preflight.issues.length === 0 ? <div className="small">Проблем не найдено.</div> : <div className="stack" style={{ gap: 8 }}>
              {preflight.issues.map((issue, index) => (
                <div className="row small" key={`${issue.code}-${issue.source ?? "campaign"}-${index}`} style={{ alignItems: "start" }}>
                  <span className={`badge ${issue.severity === "error" ? "red" : "warm"}`}>{issue.severity === "error" ? "Ошибка" : "Предупреждение"}</span>
                  <div><div>{localizePreflightIssue(issue)}</div>{issue.source && <div className="muted">Источник: {issue.source}</div>}</div>
                </div>
              ))}
            </div>}
          </section>
        )}

        <section className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div className="row" style={{ marginBottom: 14 }}><div className="section-label grow" style={{ marginBottom: 0 }}>Аналитика кампании</div><button className="btn btn-sm" onClick={loadAnalytics} disabled={analyticsBusy}>{analyticsBusy ? "Загрузка…" : "Обновить"}</button><button className="btn btn-sm btn-primary" onClick={loadInsights} disabled={analyticsBusy}>Рекомендации ИИ</button></div>
          {!analytics ? <div className="small muted">Аналитика появится после начала отправки.</div> : <>
            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}><Metric label="Открытия" value={`${analytics.rates.openRate}%`} /><Metric label="Переходы" value={`${analytics.rates.clickRate}%`} /><Metric label="Ответы" value={`${analytics.rates.replyRate}%`} /><Metric label="Возвраты" value={`${analytics.rates.bounceRate}%`} /></div>
            <div className="divider" />
            <div className="section-label">Карта кликов</div>
            {analytics.heatmap.length === 0 ? <div className="small muted">Событий кликов пока нет.</div> : <div className="stack" style={{ gap: 6 }}>{analytics.heatmap.map((item) => <div className="row small" key={item.elementId}><span className="grow" style={{ overflowWrap: "anywhere" }}>{item.url || item.elementId}</span><span className="badge blue">{item.clicks} переходов</span><span className="muted">{item.uniqueEmails} уникальных контактов</span></div>)}</div>}
            {analytics.byDay.length > 0 && <><div className="divider" /><div className="section-label">Варианты письма</div><div className="stack" style={{ gap: 6 }}>{analytics.byDay.map((day) => <div className="row small" key={day.date}><span className="grow">{day.date}</span><span>{day.sent} отправлено</span><span>{day.opens} открыто</span><span>{day.clicks} переходов</span><span>{day.replies} ответов</span></div>)}</div></>}
            {insights && <div className="card" style={{ padding: 12, marginTop: 14, background: "var(--surface-2)" }}><strong>Итоги ИИ</strong><p className="small">{insights.summary}</p><ul className="small">{insights.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul></div>}
          </>}
        </section>

        <section className="card" style={{ padding: 18, marginBottom: 20 }}><div className="row"><div className="section-label grow">Когорты и выручка</div><button className="btn btn-sm" onClick={loadCohorts}>Загрузить когорты</button></div>{cohorts.length === 0 ? <div className="small muted">Отслеживайте события контактов и покупок, чтобы видеть удержание и выручку.</div> : <div className="stack" style={{ gap: 6, marginTop: 8 }}>{cohorts.map((cohort) => <div className="row small" key={cohort.cohort}><span className="grow">{cohort.cohort}</span><span>{cohort.contacts} контактов</span><span>{cohort.retentionRate}% удержание</span><span>{cohort.purchases} покупок</span><span>{cohort.revenue.toFixed(2)} выручка</span><span>{cohort.revenuePerContact.toFixed(2)} на контакт</span></div>)}</div>}</section>

        {variants.length > 0 && (
          <FadeContent>
            <section style={{ marginBottom: 20 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <div className="section-label" style={{ marginBottom: 0 }}>A/B варианты</div>
                <span className="grow" />
                <button className="btn btn-sm" onClick={() => setVariantOpen(true)}>＋ Добавить вариант</button>
              </div>
              <div className="card" style={{ padding: 0 }}>
                {variants.map((v) => (
                  <div key={v.id} className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{v.name}</div>
                      <div className="small muted">{v.subject}</div>
                    </div>
                    <span className="small muted">{v.sent} отправлено</span>
                    <span className="small muted" style={{ marginLeft: 12 }}>{v.replies} ответов</span>
                  </div>
                ))}
              </div>
            </section>
          </FadeContent>
        )}

        {variantOpen && (
          <div className="modal-overlay" onClick={() => setVariantOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="section-label" style={{ marginBottom: 12 }}>Добавить A/B вариант</div>
              <div className="field">
                <label>Название варианта</label>
                <input className="input" value={variantForm.name} onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })} placeholder="Вариант B" />
              </div>
              <div className="field">
                <label>Тема письма</label>
                <input className="input" value={variantForm.subject} onChange={(e) => setVariantForm({ ...variantForm, subject: e.target.value })} placeholder="Например, предложение о сотрудничестве" />
              </div>
              <div className="field">
                <label>Текст письма</label>
                <textarea className="input" rows={6} value={variantForm.body} onChange={(e) => setVariantForm({ ...variantForm, body: e.target.value })} placeholder="Напишите текст варианта письма" />
              </div>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setVariantOpen(false)}>Отмена</button>
                <button className="btn btn-primary" disabled={!variantForm.subject.trim() || !variantForm.body.trim()} onClick={saveVariant}>Сохранить вариант</button>
              </div>
            </div>
          </div>
        )}

        <FadeContent>
          <section>
            <div className="section-label">Контакты рассылки</div>
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              {leads.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <div className="es-title">Лидов пока нет</div>
                  <div className="es-sub">Лиды появятся здесь после запуска кампании.</div>
                </div>
              ) : (
                <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "10px 16px" }}>Имя</th>
                      <th style={{ padding: "10px 16px" }}>Электронная почта</th>
                      <th style={{ padding: "10px 16px" }}>Статус</th>
                      <th style={{ padding: "10px 16px" }}>Отправлено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((cl) => (
                      <tr key={cl.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => router.push(`/leads/${cl.lead.id}`)}>
                        <td style={{ padding: "10px 16px", fontWeight: 550 }}>{cl.lead.name}</td>
                        <td style={{ padding: "10px 16px" }}>{cl.lead.email || "—"}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span className={`badge ${LEAD_STATUS_STYLES[cl.status] || "gray"}`}>{uiLabel(campaignLeadStatusLabels, cl.status)}</span>
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
