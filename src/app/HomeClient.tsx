"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { normalizeDashboard, type Dashboard } from "@/lib/dashboard";
import { formatDate, formatDateTime } from "@/lib/utils";
import { AnimatedCounter } from "@/components/AnimatedCounter";

const ONBOARDING_STEPS = [
  { id: "contacts", label: "Добавьте первый контакт", href: "/leads/new" },
  { id: "provider", label: "Подключите почту", href: "/settings" },
  { id: "template", label: "Создайте шаблон письма", href: "/templates/new" },
  { id: "campaign", label: "Запустите первую рассылку", href: "/campaigns/new" },
];

type Onboarding = {
  percent: number;
  done: number;
  total: number;
  steps: Array<{ id: string; label: string; href: string; completed: boolean }>;
};

type ApiError = Error & { status?: number };

function isUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as ApiError;
  return candidate.status === 401 || (error instanceof Error && /авторизац|unauthoriz/i.test(error.message));
}

export default function HomeClient({ demo: demoMode = false }: { demo?: boolean }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(demoMode);

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    Promise.all([
      api<unknown>("/api/dashboard"),
      api<{ onboarding: Onboarding }>("/api/onboarding"),
    ])
      .then(([dashboard, onboardingResponse]) => {
        if (!active) return;
        setData(normalizeDashboard(dashboard));
        setOnboarding(onboardingResponse.onboarding);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (isUnauthorized(error)) setDemo(true);
        else setError("Не удалось загрузить главную страницу. Проверьте соединение и попробуйте ещё раз.");
      });
    const demoFallback = window.setTimeout(() => {
      if (active && !data) setDemo(true);
    }, 4000);
    return () => { active = false; window.clearTimeout(demoFallback); };
  }, [data, demoMode]);

  useEffect(() => {
    if (!data) return;
    let active = true;
    let cursor = data.activities[0]?.createdAt ?? null;
    const poll = async () => {
      try {
        const result = await api<{ activities: Dashboard["activities"]; cursor: string | null }>(`/api/activity?since=${encodeURIComponent(cursor ?? "")}&limit=20`);
        if (active && result.activities.length) {
          setData((current) => current ? { ...current, activities: [...result.activities, ...current.activities].slice(0, 12) } : current);
          if (result.cursor) cursor = result.cursor;
        }
      } catch {
        // Обновление активности необязательно для работы главной страницы.
      }
    };
    const timer = window.setInterval(poll, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [data]);

  if (demo) return <DemoDashboard />;
  if (error) return <FriendlyError message={error} />;
  if (!data) return <LoadingDashboard />;

  const counters = data.counters;
  const nextStep = onboarding?.steps.find((step) => !step.completed);
  const kpis = [
    { label: "Контакты", value: counters.totalLeads },
    { label: "Писем отправлено", value: counters.emailsSent },
    { label: "Ответы", value: counters.replyRate, suffix: "%" },
    { label: "Активные рассылки", value: data.analytics.runningCampaigns },
  ];

  return (
    <div>
      <section className="hero-panel home-hero">
        <div className="hero-eyebrow">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <h1 className="page-title" style={{ marginTop: 12 }}>Рассылка без лишних шагов.</h1>
        <p className="hero-copy">Добавьте контакты, подготовьте письмо и запустите общение. Всё важное — на одном экране.</p>
        <div className="row home-hero-actions">
          <Link href="/leads/new" className="btn btn-primary">＋ Добавить контакт</Link>
          <Link href="/campaigns/new" className="btn">Создать рассылку</Link>
        </div>
        <div className="hero-orbit" aria-hidden />
      </section>

      <div className="page-head">
        <div>
          <h2 className="page-title">Главная</h2>
          <p className="page-sub">{counters.pendingFollowUps === 0 ? "На сегодня всё готово." : `${counters.pendingFollowUps} повторных контакта ждут внимания сегодня.`}</p>
        </div>
        <Link href="/leads" className="btn btn-ghost">Открыть все контакты</Link>
      </div>

      <div className="metric-grid home-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi">
            <div className="label">{kpi.label}</div>
            <div className="value"><AnimatedCounter value={kpi.value} suffix={kpi.suffix ?? ""} /></div>
          </div>
        ))}
      </div>

      {onboarding && onboarding.percent < 100 && (
        <section className="card next-step-card home-onboarding">
          <div className="next-step-number">{onboarding.done + 1}</div>
          <div className="grow">
            <div className="section-label">Следующий шаг</div>
            <strong>{nextStep?.label ?? "Завершите настройку рабочего пространства"}</strong>
            <p className="small muted">Готово {onboarding.done} из {onboarding.total}. Система ничего не отправит без вашего подтверждения.</p>
          </div>
          <Link href={nextStep?.href ?? "/activation"} className="btn btn-primary">Продолжить</Link>
        </section>
      )}

      <div className="dashboard-wide home-panels">
        <section>
          <div className="section-label">На сегодня</div>
          <div className="card home-list-card">
            {data.dueFollowUps.length === 0 ? (
              <div className="empty-state"><div className="es-icon" aria-hidden>✓</div><div className="es-title">Задач на сегодня нет</div><div className="es-sub">Когда появится новый повторный контакт, он будет показан здесь.</div></div>
            ) : data.dueFollowUps.slice(0, 5).map((followUp, index) => (
              <Link key={followUp.id} href={`/leads/${followUp.lead.id}`} className="row home-list-row">
                <div className="grow"><strong>{followUp.lead.name}</strong><div className="small muted">{followUp.lead.companyOrChannel || "Контакт"}</div></div>
                <span className="small muted">{formatDate(followUp.dueDate)}</span>
                {index === 0 && <span className="badge blue">Сегодня</span>}
              </Link>
            ))}
            {data.dueFollowUps.length > 0 && <Link href="/follow-ups" className="home-list-footer">Открыть все повторные контакты →</Link>}
          </div>
        </section>

        <section>
          <div className="section-label">Горячие контакты</div>
          <div className="card home-list-card">
            {data.hotLeads.length === 0 ? (
              <div className="empty-state"><div className="es-icon" aria-hidden>◈</div><div className="es-title">Пока нет горячих контактов</div><div className="es-sub">Добавьте или импортируйте контакты, чтобы найти перспективных клиентов.</div><Link href="/leads/import" className="btn btn-sm btn-primary">Импортировать</Link></div>
            ) : data.hotLeads.slice(0, 5).map((lead) => (
              <Link key={lead.id} href={`/leads/${lead.id}`} className="row home-list-row">
                <span className="grow"><strong>{lead.name}</strong><span className="small muted" style={{ display: "block" }}>Перспективный контакт</span></span>
                <span className={`badge ${lead.leadScore >= 80 ? "hot" : lead.leadScore >= 50 ? "warm" : "cold"}`}>{lead.leadScore} баллов</span>
              </Link>
            ))}
            {data.hotLeads.length > 0 && <Link href="/leads?score=hot" className="home-list-footer">Открыть контакты →</Link>}
          </div>
        </section>
      </div>

      <section className="home-results-section">
        <div className="row home-section-heading"><div className="section-label">Последние ответы</div><Link href="/inbox" className="btn btn-sm btn-ghost">Все ответы</Link></div>
        <div className="card home-list-card">
          {data.recentReplies.length === 0 ? (
            <div className="empty-state"><div className="es-icon" aria-hidden>✉</div><div className="es-title">Ответов пока нет</div><div className="es-sub">Ответы появятся здесь, когда кто-нибудь ответит на ваше письмо.</div></div>
          ) : data.recentReplies.slice(0, 5).map((reply) => (
            <div key={reply.id} className="row home-list-row">
              <div className="grow"><strong>{reply.lead.name}</strong><div className="small muted">{formatDateTime(reply.receivedAt)}</div></div>
              <span className={`badge ${reply.classification === "Positive" ? "green" : reply.classification === "Negative" ? "red" : "gray"}`}>{localizeClassification(reply.classification)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LoadingDashboard() {
  return <div className="home-loading" aria-label="Загрузка главной страницы"><div className="page-head"><div><div className="skeleton" style={{ width: 180, height: 30 }} /><div className="skeleton" style={{ width: 250, height: 14, marginTop: 8 }} /></div></div><div className="metric-grid">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="metric"><div className="skeleton" style={{ width: 110, height: 12 }} /><div className="skeleton" style={{ width: 62, height: 28, marginTop: 8 }} /></div>)}</div><div className="card" style={{ padding: 24 }}><div className="skeleton" style={{ height: 150 }} /></div></div>;
}

function FriendlyError({ message }: { message: string }) {
  return <div className="empty-state card" role="alert"><div className="es-icon" aria-hidden>!</div><div className="es-title">Не удалось открыть главную</div><div className="es-sub">{message}</div><button className="btn btn-primary" onClick={() => window.location.reload()}>Попробовать ещё раз</button></div>;
}

function localizeClassification(value: string): string {
  const labels: Record<string, string> = { Positive: "Положительный", Negative: "Отрицательный", Interested: "Заинтересован", NotNow: "Не сейчас", Replied: "Ответил" };
  return labels[value] ?? value;
}

function DemoDashboard() {
  const metrics = [
    ["Контакты", "1 248", "+18,4%"],
    ["Писем отправлено", "8 420", "+24,8%"],
    ["Ответы", "12,6%", "+3,2%"],
    ["Клиенты", "86", "+11,5%"],
  ];

  return (
    <div className="demo-dashboard">
      <div className="page-head">
        <div><div className="hero-eyebrow">ПРИМЕР РАБОЧЕГО ПРОСТРАНСТВА</div><h1 className="page-title" style={{ marginTop: 10 }}>Ваш центр общения</h1><p className="page-sub">Посмотрите, как ClipReach помогает превращать холодные контакты в живые диалоги.</p></div>
        <div className="row"><Link href="/login" className="btn">Войти</Link><Link href="/register" className="btn btn-primary">Начать бесплатно</Link></div>
      </div>
      <section className="hero-panel"><div className="hero-eyebrow">CLIPREACH</div><h2 className="page-title" style={{ marginTop: 12 }}>Письма, которые звучат по-человечески.</h2><p className="hero-copy">Добавляйте контакты, создавайте персональные письма и управляйте всей коммуникацией в одном понятном рабочем пространстве.</p><div className="hero-orbit" aria-hidden /></section>
      <div className="metric-grid demo-metrics">{metrics.map(([label, value, trend]) => <div className="kpi" key={label}><div className="kpi-icon">✦</div><div className="label">{label}</div><div className="value">{value}</div><div className="kpi-trend" style={{ color: "var(--green)" }}>{trend} за 30 дней</div></div>)}</div>
      <div className="demo-grid"><section className="card demo-feature"><div className="demo-feature-icon">◈</div><h3>Персональные письма</h3><p>Письма адаптируются под нишу, компанию и контекст каждого контакта.</p><Link href="/register" className="btn btn-sm">Попробовать</Link></section><section className="card demo-feature"><div className="demo-feature-icon">◎</div><h3>Безопасная отправка</h3><p>Лимиты, проверка и подтверждение встроены в каждый рабочий сценарий.</p><Link href="/register" className="btn btn-sm">Создать рабочее место</Link></section><section className="card demo-feature"><div className="demo-feature-icon">↗</div><h3>Всё в одном месте</h3><p>Ответы, повторные контакты и результаты всегда перед глазами.</p><Link href="/register" className="btn btn-sm">Открыть возможности</Link></section></div>
    </div>
  );
}
