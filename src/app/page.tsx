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
  LeadCreated: { icon: "✓", cls: "green", label: "Лид создан" },
  LeadImported: { icon: "⇪", cls: "green", label: "Лид импортирован" },
  EmailGenerated: { icon: "✉", cls: "accent", label: "Письмо создано" },
  EmailApproved: { icon: "✓", cls: "blue", label: "Письмо одобрено" },
  EmailSent: { icon: "➤", cls: "gray", label: "Письмо отправлено" },
  StatusChanged: { icon: "↻", cls: "gray", label: "Статус изменён" },
  Analyzed: { icon: "◈", cls: "accent", label: "Лид проанализирован" },
};

export default function HomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [onboarding, setOnboarding] = useState<{ percent: number; done: number; total: number; steps: Array<{ id: string; label: string; href: string; completed: boolean }> } | null>(null);

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

  const isUnauthorized = error.toLowerCase().includes("unauthorized") || error.includes("401");

  if (isUnauthorized) {
    return <DemoDashboard />;
  }

  useEffect(() => {
    let active = true;
    api<{ onboarding: NonNullable<typeof onboarding> }>("/api/onboarding").then((result) => { if (active) setOnboarding(result.onboarding); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!data) return;
    let active = true;
    let cursor = data.activities[0]?.createdAt ?? null;
    const poll = async () => {
      try { const result = await api<{ activities: Dashboard["activities"]; cursor: string | null }>(`/api/activity?since=${encodeURIComponent(cursor ?? "")}&limit=20`); if (active && result.activities.length) { setData((current) => current ? { ...current, activities: [...result.activities, ...current.activities].slice(0, 12) } : current); if (result.cursor) cursor = result.cursor; } } catch { /* polling is best effort */ }
    };
    const timer = window.setInterval(poll, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [data]);

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
    { label: "Лиды", value: c.totalLeads, icon: "◈", accent: true },
    { label: "Отправлено писем", value: c.emailsSent, icon: "➤", suffix: "" },
    { label: "Reply rate", value: c.replyRate, icon: "💬", suffix: "%" },
    { label: "Квалифицировано", value: c.qualified, icon: "✓", suffix: "" },
    { label: "Клиенты", value: c.clients, icon: "★", suffix: "" },
    { label: "Новые лиды", value: c.newLeads, icon: "✦", suffix: "" },
  ];

  return (
    <div>
      <section className="hero-panel">
        <div className="hero-eyebrow">CLIPREACH / ОПЕРАЦИОННЫЙ ЦЕНТР</div>
        <h1 className="page-title" style={{ marginTop: 12 }}>Ваши продажи. На автопилоте.</h1>
        <p className="hero-copy">Персональные письма, точные сегменты и живые ответы в одном пространстве. Сегодняшние возможности уже ждут вас.</p>
        <div className="hero-orbit" aria-hidden />
      </section>
      <div className="page-head">
        <div>
          <BlurText text="Главная" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub">
            <ShinyText text={c.pendingFollowUps === 0 ? "На сегодня всё готово — повторных контактов нет." : `${c.pendingFollowUps} повторных контакта запланировано на сегодня.`} speed={3} shineColor="#a0a0b0" />
          </p>
        </div>
        <div className="row">
          <Link href="/leads/import" className="btn">⇪ Импортировать лиды</Link>
          <Link href="/leads/new" className="btn btn-primary">＋ Добавить лид</Link>
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

      {onboarding && onboarding.percent < 100 && <FadeContent><section style={{ margin: "20px 0" }}><div className="row" style={{ marginBottom: 8 }}><div className="section-label grow" style={{ marginBottom: 0 }}>Get started</div><span className="small muted">{onboarding.done}/{onboarding.total} complete</span></div><div className="card" style={{ padding: 18 }}><div style={{ height: 8, background: "var(--surface-3)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}><div style={{ width: `${onboarding.percent}%`, height: "100%", background: "var(--accent)", transition: "width .25s ease" }} /></div><div className="stack" style={{ gap: 8 }}>{onboarding.steps.map((step) => <Link href={step.href} key={step.id} className="row small surface-hover" style={{ padding: 8, textDecoration: "none" }}><span className={`badge ${step.completed ? "green" : "gray"}`}>{step.completed ? "Done" : "Next"}</span><span className="grow">{step.label}</span></Link>)}</div></div></section></FadeContent>}

      <FadeContent>
        <section style={{ marginBottom: 24 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Аналитика кампаний</div>
            <span className="grow" />
            <Link href="/campaigns" className="btn btn-sm btn-ghost">Открыть кампании</Link>
          </div>
          <div className="metric-grid">
            <div className="kpi">
              <div className="label">Кампании</div>
              <div className="value"><AnimatedCounter value={data.analytics.totalCampaigns} /></div>
              <div className="small muted">{data.analytics.runningCampaigns} запущено</div>
            </div>
            <div className="kpi">
              <div className="label">Доставлено</div>
              <div className="value"><AnimatedCounter value={data.analytics.delivered} /></div>
            </div>
            <div className="kpi">
              <div className="label">Возвраты</div>
              <div className="value"><AnimatedCounter value={data.analytics.bounced} /></div>
            </div>
            <div className="kpi">
              <div className="label">Ошибки</div>
              <div className="value"><AnimatedCounter value={data.analytics.failed} /></div>
            </div>
            <div className="kpi">
              <div className="label">Отписались</div>
              <div className="value"><AnimatedCounter value={data.analytics.unsubscribed} /></div>
            </div>
            <div className="kpi">
              <div className="label">Ответы</div>
              <div className="value"><AnimatedCounter value={c.replyRate} suffix="%" /></div>
            </div>
          </div>
        </section>
      </FadeContent>

      <div className="dashboard-wide" style={{ alignItems: "start" }}>
        <section>
          <div className="section-label">Горячие лиды</div>
          <SpotlightCard className="card" spotlightColor="rgba(255, 92, 31, 0.18)">
            {data.hotLeads.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <div className="es-icon" aria-hidden>◈</div>
                <div className="es-title">Горячих лидов пока нет</div>
                <div className="es-sub">Проанализируйте лидов или импортируйте список, чтобы найти перспективных клиентов.</div>
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
          <div className="section-label">Повторные контакты на сегодня</div>
          <SpotlightCard className="card" spotlightColor="rgba(37, 99, 235, 0.16)">
            {data.dueFollowUps.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <div className="es-icon" aria-hidden>⏰</div>
                <div className="es-title">На сегодня ничего нет</div>
                <div className="es-sub">Повторные контакты на сегодня не запланированы.</div>
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
          <div className="section-label">Лента активности</div>
          <div className="card" style={{ overflow: "hidden" }}>
            {data.activities.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <div className="es-icon" aria-hidden>⚡</div>
                <div className="es-title">Активности пока нет</div>
                <div className="es-sub">Импортируйте лидов и создайте письма — последние действия появятся здесь.</div>
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
          <div className="section-label">Последние ответы</div>
          <SpotlightCard className="card" spotlightColor="rgba(37, 99, 235, 0.14)">
            {data.recentReplies.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <div className="es-icon" aria-hidden>💬</div>
                <div className="es-title">Ответов пока нет</div>
                <div className="es-sub">Ответы появятся здесь, как только кто-нибудь ответит на письмо.</div>
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

function DemoDashboard() {
  const metrics = [
    ["Лиды", "1 248", "+18,4%"],
    ["Отправлено писем", "8 420", "+24,8%"],
    ["Ответы", "12,6%", "+3,2%"],
    ["Клиенты", "86", "+11,5%"],
  ];

  return (
    <div className="demo-dashboard">
      <div className="page-head">
        <div>
          <div className="hero-eyebrow">ПУБЛИЧНЫЙ ПРОСМОТР</div>
          <h1 className="page-title" style={{ marginTop: 10 }}>Ваш центр продаж</h1>
          <p className="page-sub">Посмотрите, как ClipReach превращает холодные контакты в живые диалоги.</p>
        </div>
        <div className="row">
          <Link href="/login" className="btn">Войти</Link>
          <Link href="/register" className="btn btn-primary">Начать бесплатно</Link>
        </div>
      </div>
      <section className="hero-panel">
        <div className="hero-eyebrow">CLIPREACH / DEMO WORKSPACE</div>
        <h2 className="page-title" style={{ marginTop: 12 }}>Умные рассылки,<br />которые звучат по-человечески.</h2>
        <p className="hero-copy">Импортируйте лидов, создавайте персональные письма с ИИ и управляйте всей коммуникацией в одном красивом рабочем пространстве.</p>
        <div className="hero-orbit" aria-hidden />
      </section>
      <div className="metric-grid demo-metrics">
        {metrics.map(([label, value, trend]) => <div className="kpi" key={label}><div className="kpi-icon">✦</div><div className="label">{label}</div><div className="value">{value}</div><div className="kpi-trend" style={{ color: "var(--green)" }}>{trend} за 30 дней</div></div>)}
      </div>
      <div className="demo-grid">
        <section className="card demo-feature"><div className="demo-feature-icon">◈</div><h3>Персонализация с ИИ</h3><p>Письма адаптируются под нишу, компанию и контекст каждого лида.</p><Link href="/register" className="btn btn-sm">Попробовать генератор</Link></section>
        <section className="card demo-feature"><div className="demo-feature-icon">◎</div><h3>Безопасная отправка</h3><p>Доставляемость, лимиты и согласование встроены в каждый сценарий.</p><Link href="/register" className="btn btn-sm">Создать рабочее место</Link></section>
        <section className="card demo-feature"><div className="demo-feature-icon">↗</div><h3>Вся воронка в одном месте</h3><p>Ответы, повторные контакты и аналитика всегда перед глазами.</p><Link href="/register" className="btn btn-sm">Открыть возможности</Link></section>
      </div>
    </div>
  );
}
