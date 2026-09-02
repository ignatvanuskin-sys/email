"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import SpotlightCard from "@/components/react-bits/SpotlightCard";
import { formatDateTime } from "@/lib/utils";

type Сервис = {
  id: string;
  kind: string;
  platform?: string;
  isActive: boolean;
  dailyLimit: number;
  configured?: boolean;
  safeConfig?: { host?: string; port?: number; user?: string; from?: string; model?: string };
  createdAt: string;
};
type Suppression = { id: string; email: string; reason: string; createdAt: string };

export default function SettingsPage() {
  const [paused, setPaused] = useState(false);
  const [providers, setСервисs] = useState<Сервис[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKind, setSavingKind] = useState<"email" | "ai" | null>(null);
  const [workspace, setWorkspace] = useState({ name: "", logoUrl: "", brandColor: "#2563eb", customDomain: "" });
  const [workspaceRole, setWorkspaceRole] = useState("Owner");
  const { notify } = useToast();

  const load = useCallback(async () => {
    try {
      const [me, prov, sup, ws] = await Promise.all([
        api<{ user: { outreachPaused: boolean } }>("/api/auth/me"),
        api<{ providers: Сервис[] }>("/api/settings/providers"),
        api<{ entries: Suppression[] }>("/api/suppressions"),
        api<{ workspace: { name: string; logoUrl: string | null; brandColor: string; customDomain: string | null }; role: string }>("/api/workspace"),
      ]);
      setPaused(me.user.outreachPaused);
      setСервисs(prov.providers);
      setSuppressions(sup.entries);
      setWorkspace({ name: ws.workspace.name, logoUrl: ws.workspace.logoUrl ?? "", brandColor: ws.workspace.brandColor, customDomain: ws.workspace.customDomain ?? "" });
      setWorkspaceRole(ws.role);
    } catch (e) {
      setError("Не удалось загрузить настройки. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePause = async () => {
    const next = !paused;
    if (next && !window.confirm("Приостановить всю рассылку? Новые письма не будут отправляться, пока вы не возобновите работу.")) return;
    await api("/api/settings/pause", { method: "POST", body: JSON.stringify({ paused: next }) });
    setPaused(next);
    notify(next ? "Рассылка приостановлена." : "Рассылка возобновлена.", "info");
  };

  const removeСервис = async (id: string) => {
    try {
      setError("");
      await api(`/api/settings/providers?id=${id}`, { method: "DELETE" });
      setNotice("Провайдер удалён.");
      await load();
    } catch (e) {
      setError("Не удалось удалить подключение. Попробуйте ещё раз.");
    }
  };

  const addSuppression = async (email: string) => {
    await api("/api/suppressions", { method: "POST", body: JSON.stringify({ email, reason: "ManualBlock" }) });
    load();
  };

  const removeSuppression = async (id: string) => {
    await api(`/api/suppressions?id=${id}`, { method: "DELETE" });
    load();
  };

  const saveСервис = async (body: Record<string, unknown>) => {
    const kind = body.type === "email" ? "email" : "ai";
    setSavingKind(kind);
    setNotice("");
    setError("");
    try {
      const response = await api<{ provider: Сервис }>("/api/settings/providers", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setСервисs((current) => {
        const saved = response.provider;
        return [saved, ...current.filter((p) => !(p.kind === saved.kind && p.id !== saved.id))];
      });
      await load();
      setNotice("Провайдер сохранён.");
    } catch (e) {
      setError("Не удалось сохранить подключение. Проверьте данные и попробуйте ещё раз.");
    } finally {
      setSavingKind(null);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Настройки" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text="Подключение провайдеров и безопасное управление рассылкой." speed={3} /></p>
        </div>
      </div>

      {notice && <div className="card" style={{ padding: 12, marginBottom: 16, borderColor: "var(--green)", color: "var(--green)" }}>{notice}</div>}
      {error && <div className="card" style={{ padding: 12, marginBottom: 16, borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>}
      {loading && <div className="card empty">Загрузка настроек…</div>}

      {!loading && <PageTransition><div className="stack" style={{ gap: 20 }}>
        <section>
          <div className="section-label">Пауза рассылки</div>
          <SpotlightCard className="card" spotlightColor="rgba(217, 119, 6, 0.15)">
            <div style={{ padding: 18 }}>
              <p className="small muted" style={{ marginTop: 0 }}>Мгновенно остановить постановку новых писем в очередь.</p>
              <button className={`pause-control ${paused ? "paused" : "активен"}`} onClick={togglePause} aria-pressed={paused}>
                <span className={`pulse-dot ${paused ? "paused" : "live"}`} aria-hidden />
                <span className="pause-label">{paused ? "РАССЫЛКА ПРИОСТАНОВЛЕНА" : "РАССЫЛКА АКТИВНА"}</span>
                <span aria-hidden>{paused ? "▶ Возобновить" : "⏹ Приостановить всё"}</span>
              </button>
            </div>
          </SpotlightCard>
        </section>

        <section>
          <div className="section-label">Состояние подключений</div>
          <div className="card" style={{ padding: 18 }}>
            <div className="stack" style={{ gap: 10, marginTop: 8 }}>
              <StatusRow label="Почтовый сервис" connected={providers.some((p) => p.kind === "email" && p.configured)} detail="Данные SMTP зашифрованы" />
              <StatusRow label="ИИ-сервис" connected={providers.some((p) => p.kind === "ai" && p.configured)} detail="Ключ зашифрован и не показывается" />
              <StatusRow label="Авторизация" connected detail="Сессия защищена cookie HTTP-only" />
            </div>
          </div>
        </section>

        <СервисPane label="Почтовый сервис" providers={providers.filter((p) => p.kind === "email" || p.kind === "telegram")} onУдалить={removeСервис}>
          <EmailForm onSave={saveСервис} saving={savingKind === "email"} savedСервис={providers.find((p) => p.kind === "email" && p.isActive)} />
        </СервисPane>

         <СервисPane label="ИИ-сервис" providers={providers.filter((p) => p.kind === "ai")} onУдалить={removeСервис}>
          <AiForm onSave={saveСервис} saving={savingKind === "ai"} savedСервис={providers.find((p) => p.kind === "ai" && p.isActive)} />
        </СервисPane>

        <details className="advanced-settings">
          <summary className="settings-summary"><span><strong>Дополнительные настройки</strong><span className="small muted"> Редкие и административные функции</span></span><span aria-hidden>⌄</span></summary>
          <div className="settings-advanced-stack">
            <WorkspacePane workspace={workspace} role={workspaceRole} onSaved={(next) => setWorkspace(next)} />
            <UsagePane />
            <IntegrationsPane />
            <PlatformAccessPane />
          </div>
        </details>

        <section>
          <div className="section-label">Защищённый список адресов</div>
          <SpotlightCard className="card" spotlightColor="rgba(220, 38, 38, 0.14)">
            <div style={{ padding: 18 }}>
              <p className="small muted" style={{ marginTop: 0 }}>
                 Эти адреса никогда не получат от вас новые письма. Отписки и жёсткие возвраты добавляются сюда автоматически.
              </p>
              <AddEmail onAdd={addSuppression} />
              <div className="stack" style={{ marginTop: 12 }}>
                {suppressions.length === 0 ? (
                  <div className="small muted">Защищённых адресов пока нет.</div>
                ) : (
                  suppressions.map((s) => (
                    <div key={s.id} className="row">
                      <span className="grow">{s.email}</span>
                      <span className={`badge ${s.reason === "Unsubscribed" ? "red" : "gray"}`}>{localizeSuppressionReason(s.reason)}</span>
                      <button className="btn btn-sm btn-ghost-danger" onClick={() => removeSuppression(s.id)}>Удалить</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </SpotlightCard>
        </section>

        <section>
          <div className="section-label">Безопасность</div>
          <div className="card" style={{ padding: 18 }}>
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              <div className="row"><span className="grow">Пароли</span><span className="badge green">Защищены bcrypt</span></div>
              <div className="row"><span className="grow">Данные провайдеров</span><span className="badge green">Зашифрованы</span></div>
              <div className="row"><span className="grow">Защита от повторной отправки</span><span className="badge blue">Проверяется при отправке</span></div>
              <div className="row"><span className="grow">Ручное одобрение</span><span className="badge blue">Требуется перед отправкой</span></div>
            </div>
          </div>
        </section>
      </div></PageTransition>}
    </div>
  );
}

function StatusRow({ label, connected, detail }: { label: string; connected: boolean; detail: string }) {
  return (
    <div className="row">
      <span className="pulse-dot" style={{ color: connected ? "var(--green)" : "var(--text-faint)" }} aria-hidden />
      <span className="grow" style={{ fontWeight: 600 }}>{label}</span>
      <span className={`badge ${connected ? "green" : "gray"}`}>{connected ? "Подключён" : "Не подключён"}</span>
      <span className="small muted">{detail}</span>
    </div>
  );
}

function СервисPane({ label, providers, onУдалить, children }: {
  label: string; providers: Сервис[]; onУдалить: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="section-label">{label}</div>
      <div className="stack" style={{ marginBottom: 12 }}>
        {providers.length === 0 ? (
          <div className="small muted">Провайдер не подключён. Подключите его, чтобы использовать эту функцию.</div>
        ) : (
          providers.map((p, index) => (
            <div key={`${p.kind}-${p.id}-${index}`} className="row">
              <span className="grow">Сервис {p.isActive && <span className="badge green">активен</span>}</span>
              <span className="small muted">лимит {p.dailyLimit}/день</span>
              <button className="btn btn-sm btn-ghost-danger" onClick={() => onУдалить(p.id)}>Удалить</button>
            </div>
          ))
        )}
      </div>
      {children}
    </section>
  );
}
function EmailForm({ onSave, saving, savedСервис }: { onSave: (b: Record<string, unknown>) => void; saving: boolean; savedСервис?: Сервис }) {
  const [form, setForm] = useState({ host: "smtp.gmail.com", port: "587", user: "", pass: "", from: "" });
  useEffect(() => {
    if (!savedСервис?.safeConfig) return;
    setForm((current) => ({ ...current, host: savedСервис.safeConfig?.host ?? current.host, port: String(savedСервис.safeConfig?.port ?? current.port), user: savedСервис.safeConfig?.user ?? current.user, from: savedСервис.safeConfig?.from ?? current.from, pass: "" }));
  }, [savedСервис]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form className="card" style={{ background: "var(--surface-2)", padding: 14 }} onSubmit={(e) => {
      e.preventDefault();
      onSave({
        type: "email",
        platform: "SMTP",
        config: JSON.stringify({ type: "SMTP", host: form.host, port: Number(form.port), secure: form.port === "465", user: form.user, pass: form.pass, from: form.from }),
        dailyLimit: 25,
      });
    }}>
      <div className="row">
        <div className="field grow"><label>Сервер</label><input className="input" value={form.host} onChange={set("host")} placeholder="smtp.example.com" required /></div>
        <div className="field" style={{ width: 90 }}><label>Порт</label><input className="input" value={form.port} onChange={set("port")} /></div>
      </div>
      <div className="row">
        <div className="field grow"><label>Логин</label><input className="input" value={form.user} onChange={set("user")} required /></div>
        <div className="field grow"><label>Пароль</label><input className="input" type="password" value={form.pass} onChange={set("pass")} required={!savedСервис?.configured} placeholder={savedСервис?.configured ? "Сохранённый пароль защищён; оставьте пустым, чтобы не менять" : "Пароль приложения"} /></div>
      </div>
      <div className="field"><label>Адрес отправителя</label><input className="input" value={form.from} onChange={set("from")} placeholder="you@example.com" /></div>
      {savedСервис?.configured && <div className="small" style={{ color: "var(--green)", marginBottom: 8 }}>SMTP настроен. Секретные поля скрыты для безопасности.</div>}
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Сохранение…" : savedСервис ? "Обновить почтовый сервис" : "Сохранить почтовый сервис"}</button>
    </form>
  );
}

function AiForm({ onSave, saving, savedСервис }: { onSave: (b: Record<string, unknown>) => void; saving: boolean; savedСервис?: Сервис }) {
  const hasSavedСервис = Boolean(savedСервис?.configured);
  type Model = { id: string; name: string; provider: string; contextLength: number | null; isFree: boolean; status: string };
  const [platform, setPlatform] = useState("OpenAI");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  useEffect(() => {
    if (!savedСервис?.safeConfig) return;
    setModel(savedСервис.safeConfig.model ?? "");
    if (savedСервис.platform) setPlatform(savedСервис.platform);
  }, [savedСервис]);
  const [models, setModels] = useState<Model[]>([]);
  const [freeOnly, setFreeOnly] = useState(true);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (platform !== "OpenRouter") return;
    api<{ models: Model[]; fallback: boolean }>(`/api/settings/ai-models?freeOnly=${freeOnly}`)
      .then((data) => { setModels(data.models); setMessage(data.fallback ? "OpenRouter недоступен: показан резервный список." : ""); })
      .catch((e) => setMessage(e instanceof Error ? e.message : "Не удалось загрузить модели"));
  }, [platform, freeOnly]);

  const testПодключитьion = async () => {
    setTesting(true);
    try {
      const result = await api<{ message: string }>("/api/settings/test-connection", {
        method: "POST", body: JSON.stringify({ platform, apiKey, model }),
      });
      setMessage(result.message);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Проверка не удалась"); }
    finally { setTesting(false); }
  };

  return (
    <form className="card" style={{ background: "var(--surface-2)", padding: 14 }} onSubmit={(e) => {
      e.preventDefault();
      if (hasSavedСервис && !apiKey) {
        onSave({ type: "ai", platform, config: JSON.stringify({ platform }), dailyLimit: 50 });
        return;
      }
      onSave({ type: "ai", platform, config: JSON.stringify({ platform, apiKey, model }), dailyLimit: 50 });
    }}>
      <div className="field"><label>ИИ-сервис</label>
        <select className="select" value={platform} onChange={(e) => { setPlatform(e.target.value); setModel(""); }}>
          <option value="OpenAI">OpenAI</option>
          <option value="OpenRouter">OpenRouter</option>
        </select>
      </div>
      <div className="field"><label>API-ключ</label><input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasSavedСервис ? "Сохранённый ключ защищён; оставьте пустым, чтобы не менять" : "Введите ключ при первичном подключении"} required={!hasSavedСервис} /></div>
      {platform === "OpenRouter" ? <>
        <label className="row small"><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Только бесплатные модели</label>
        <div className="field"><label>Модель</label><select className="select" value={model} onChange={(e) => setModel(e.target.value)} required={!hasSavedСервис}>
          <option value="">Выберите модель</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.provider}{m.isFree ? " — бесплатно" : ""}{m.contextLength ? ` — контекст ${m.contextLength.toLocaleString("ru-RU")}` : ""} — {m.status === "available" ? "доступна" : "статус неизвестен"}</option>)}
        </select></div>
        <button className="btn" type="button" disabled={testing || !model} onClick={testПодключитьion}>{testing ? "Проверка…" : "Проверить подключение"}</button>
      </> : <div className="field"><label>Модель (необязательно)</label><input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="автоматически" /></div>}
      {message && <div className="small muted">{message}</div>}
      {savedСервис?.configured && <div className="small" style={{ color: "var(--green)", marginBottom: 8 }}>ИИ-сервис настроен. API-ключ больше не показывается.</div>}
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Сохранение…" : savedСервис ? "Обновить ИИ-сервис" : "Сохранить ИИ-сервис"}</button>
    </form>
  );
}

function AddEmail({ onAdd }: { onAdd: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (email.trim()) { onAdd(email.trim()); setEmail(""); } }}>
      <input className="input grow" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="blocked@example.com" />
      <button className="btn btn-primary">Заблокировать</button>
    </form>
  );
}

function UsagePane() {
  const [usage, setUsage] = useState<{ plan: string; period: string; metrics: Array<{ metric: string; used: number; limit: number; remaining: number; percent: number }> } | null>(null);
  useEffect(() => { api<{ usage: typeof usage }>("/api/usage").then((result) => setUsage(result.usage)).catch(() => {}); }, []);
  if (!usage) return null;
  return <section className="card" style={{ padding: 18 }}><div className="row"><div className="section-label grow">Использование и тариф</div><span className="badge blue">{localizePlan(usage.plan)} · {usage.period}</span></div><div className="stack" style={{ gap: 10, marginTop: 10 }}>{usage.metrics.map((metric) => <div key={metric.metric}><div className="row small"><span className="grow">{localizeUsageMetric(metric.metric)}</span><span>{metric.used.toLocaleString()} / {metric.limit.toLocaleString()}</span></div><div style={{ height: 6, background: "var(--surface-3)", borderRadius: 6, overflow: "hidden", marginTop: 4 }}><div style={{ width: `${metric.percent}%`, height: "100%", background: metric.percent >= 90 ? "var(--red)" : "var(--accent)" }} /></div></div>)}</div><div className="small muted" style={{ marginTop: 10 }}>Оплата готова к подключению. Текущие лимиты действуют ежемесячно.</div></section>;
}

function IntegrationsPane() {
  const { notify } = useToast();
  const [provider, setСервис] = useState<"shopify" | "woocommerce">("shopify");
  const [name, setНазвание] = useState("Мой магазин");
  const [secret, setSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [items, setItems] = useState<Array<{ id: string; provider: string; name: string; publicToken: string; status: string; eventCount: number; lastEventAt: string | null; lastError: string | null }>>([]);
  const load = useCallback(async () => { try { const result = await api<{ integrations: typeof items }>("/api/integrations"); setItems(result.integrations); } catch { notify("Не удалось загрузить интеграции.", "error"); } }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const create = async () => { try { const result = await api<{ webhookUrl: string }>("/api/integrations", { method: "POST", body: JSON.stringify({ provider, name, secret }) }); setWebhookUrl(result.webhookUrl); setSecret(""); await load(); notify("Интеграция создана.", "success"); } catch { notify("Не удалось создать интеграцию.", "error"); } };
  return <section className="card" style={{ padding: 18 }}><div className="row"><div className="grow"><div className="section-label">Интеграции с магазинами</div><div className="small muted">Подключайте магазин, чтобы использовать события заказов и товаров в автоматических сценариях.</div></div><span className="badge blue">По событиям</span></div><div className="row" style={{ alignItems: "end", gap: 8, marginTop: 12 }}><div className="field"><label>Сервис</label><select className="select" value={provider} onChange={(e) => setСервис(e.target.value as typeof provider)}><option value="shopify">Shopify</option><option value="woocommerce">WooCommerce</option></select></div><div className="field grow"><label>Название</label><input className="input" value={name} onChange={(e) => setНазвание(e.target.value)} /></div><div className="field grow"><label>Секрет вебхука</label><input className="input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Минимум 16 символов" /></div><button className="btn btn-primary" onClick={create} disabled={secret.length < 16}>Подключить</button></div>{webhookUrl && <div className="small" style={{ marginTop: 10 }}>URL вебхука: <code style={{ overflowWrap: "anywhere" }}>{webhookUrl}</code></div>}<div className="stack" style={{ gap: 7, marginTop: 12 }}>{items.map((item) => <div className="row small" key={item.id}><span className="badge gray">{item.provider}</span><span className="grow">{item.name}</span><span>{item.eventCount} событий</span><span className={`badge ${item.status === "Подключён" || item.status === "Connected" ? "green" : "red"}`}>{localizeIntegrationStatus(item.status)}</span>{item.lastError && <span className="muted">{item.lastError}</span>}</div>)}</div></section>;
}

function PlatformAccessPane() {
  const { notify } = useToast();
  const [keyНазвание, setKeyНазвание] = useState("Интеграция с сайтом");
  const [newKey, setNewKey] = useState("");
  const [keys, setKeys] = useState<Array<{ id: string; name: string; prefix: string; scopes: string[]; createdAt: string }>>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [endpoints, setEndpoints] = useState<Array<{ id: string; url: string; событий: string[]; isActive: boolean; createdAt: string }>>([]);
  const [members, setMembers] = useState<Array<{ id: string; role: string; user: { email: string; name: string | null } }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCreated, setInviteCreated] = useState(false);
  const [logs, setLogs] = useState<Array<{ id: string; action: string; resource: string; createdAt: string }>>([]);
  const [deliveryEndpoint, setDeliveryEndpoint] = useState<string | null>(null);
  const [deliveries, setДоставки] = useState<Array<{ id: string; eventType: string; status: string; попыток: number; responseCode: number | null; lastError: string | null }>>([]);

  const load = useCallback(async () => {
    try {
      const [keyData, webhookData, memberData, auditData] = await Promise.all([api<{ keys: typeof keys }>("/api/settings/api-keys"), api<{ endpoints: typeof endpoints }>("/api/settings/webhooks"), api<{ members: typeof members }>("/api/workspace/members"), api<{ logs: typeof logs }>("/api/workspace/audit")]);
      setKeys(keyData.keys); setEndpoints(webhookData.endpoints); setMembers(memberData.members); setLogs(auditData.logs);
    } catch { notify("Не удалось загрузить дополнительные настройки.", "error"); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const createKey = async () => { try { const result = await api<{ key: string }>("/api/settings/api-keys", { method: "POST", body: JSON.stringify({ name: keyНазвание }) }); setNewKey(result.key); await load(); notify("Ключ создан. Скопируйте его сейчас: повторно он показан не будет.", "success"); } catch { notify("Не удалось создать ключ.", "error"); } };
  const createWebhook = async () => { try { const result = await api<{ secret: string }>("/api/settings/webhooks", { method: "POST", body: JSON.stringify({ url: webhookUrl }) }); setNewSecret(result.secret); setWebhookUrl(""); await load(); notify("Вебхук создан. Сохраните секрет сейчас.", "success"); } catch { notify("Не удалось создать вебхук.", "error"); } };
  const invite = async () => { try { await api<{ invitation: { id: string; email: string; role: string; expiresAt: string } }>("/api/workspace/members", { method: "POST", body: JSON.stringify({ email: inviteEmail, role: "Viewer" }) }); setInviteCreated(true); setInviteEmail(""); await load(); notify("Приглашение создано. Передайте его приглашённому пользователю выбранным способом.", "success"); } catch { notify("Не удалось создать приглашение.", "error"); } };
  const loadДоставки = async (id: string) => { try { const result = await api<{ deliveries: typeof deliveries }>(`/api/settings/webhooks/${id}/deliveries`); setDeliveryEndpoint(id); setДоставки(result.deliveries); } catch { notify("Не удалось загрузить журнал доставок.", "error"); } };
  const replay = async (id: string, deliveryId: string) => { try { await api(`/api/settings/webhooks/${id}/replay?deliveryId=${encodeURIComponent(deliveryId)}`, { method: "POST" }); if (deliveryEndpoint) await loadДоставки(deliveryEndpoint); } catch { notify("Не удалось повторить доставку.", "error"); } };
  return <section className="card" style={{ padding: 18 }}><div className="section-label">Доступ к платформе</div><div className="stack" style={{ gap: 18 }}><div><strong>API-ключи</strong><div className="row" style={{ marginTop: 8 }}><input className="input grow" value={keyНазвание} onChange={(e) => setKeyНазвание(e.target.value)} /><button className="btn btn-primary" onClick={createKey}>Создать ключ</button></div>{newKey && <code className="small" style={{ display: "block", marginTop: 8, overflowWrap: "anywhere" }}>{newKey}</code>}{keys.map((key) => <div className="row small" key={key.id} style={{ marginTop: 6 }}><span className="grow">{key.name} · {key.prefix}...</span><span className="muted">{key.scopes.join(", ")}</span></div>)}</div><div><strong>Вебхуки</strong><div className="row" style={{ marginTop: 8 }}><input className="input grow" type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" /><button className="btn btn-primary" onClick={createWebhook} disabled={!webhookUrl}>Создать вебхук</button></div>{newSecret && <code className="small" style={{ display: "block", marginTop: 8, overflowWrap: "anywhere" }}>{newSecret}</code>}{endpoints.map((endpoint) => <div className="row small" key={endpoint.id} style={{ marginTop: 6 }}><span className="grow" style={{ overflowWrap: "anywhere" }}>{endpoint.url}</span><button className="btn btn-sm" onClick={() => loadДоставки(endpoint.id)}>Доставки</button></div>)}</div>{deliveryEndpoint && <div><strong>Журнал доставок</strong>{deliveries.map((delivery) => <div className="row small" key={delivery.id} style={{ marginTop: 6 }}><span className="grow">{localizeDeliveryEvent(delivery.eventType)} · {localizeDeliveryStatus(delivery.status)}</span><span>{delivery.попыток} попыток</span>{delivery.responseCode && <span>HTTP {delivery.responseCode}</span>}{delivery.status !== "Delivered" && <button className="btn btn-sm" onClick={() => replay(deliveryEndpoint, delivery.id)}>Повторить</button>}</div>)}</div>}<div><strong>Команда</strong><div className="row" style={{ marginTop: 8 }}><input className="input grow" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@example.com" /><button className="btn" onClick={invite} disabled={!inviteEmail}>Пригласить наблюдателя</button></div>{inviteCreated && <div className="small muted" style={{ marginTop: 6 }}>Приглашение создано. Секретный токен не показывается в браузере.</div>}{members.map((member) => <div className="row small" key={member.id} style={{ marginTop: 6 }}><span className="grow">{member.user.name || member.user.email}</span><span className="badge gray">{localizeRole(member.role)}</span></div>)}</div><div><strong>Журнал аудита</strong>{logs.slice(0, 8).map((log) => <div className="row small" key={log.id} style={{ marginTop: 6 }}><span className="grow">{log.action} · {log.resource}</span><span className="muted">{formatDateTime(log.createdAt)}</span></div>)}</div></div></section>;
}

function localizeIntegrationStatus(value: string): string { return ({ Connected: "Подключён", Failed: "Ошибка", Pending: "Проверяется" } as Record<string, string>)[value] ?? value; }
function localizeDeliveryEvent(value: string): string { return ({ email: "Письмо", webhook: "Вебхук", delivery: "Доставка" } as Record<string, string>)[value] ?? value; }
function localizeDeliveryStatus(value: string): string { return ({ Delivered: "Доставлено", Failed: "Ошибка", Pending: "Ожидает отправки", Retrying: "Повторная попытка" } as Record<string, string>)[value] ?? value; }
function localizePlan(value: string): string { return ({ Free: "Бесплатный", Pro: "Профессиональный", Agency: "Агентство" } as Record<string, string>)[value] ?? value; }
function localizeUsageMetric(value: string): string { return ({ emails: "Письма", leads: "Контакты", contacts: "Контакты", ai: "Запросы ИИ", aiGenerations: "Генерации ИИ", campaigns: "Рассылки", apiEvents: "События API" } as Record<string, string>)[value] ?? value; }
function localizeRole(value: string): string { return ({ Owner: "Владелец", Admin: "Администратор", Marketer: "Маркетолог", Viewer: "Наблюдатель" } as Record<string, string>)[value] ?? value; }
function localizeSuppressionReason(value: string): string { return ({ Unsubscribed: "Отписался", HardBounce: "Письмо не доставлено", ManualBlock: "Добавлен вручную" } as Record<string, string>)[value] ?? value; }

function WorkspacePane({ workspace, role, onSaved }: { workspace: { name: string; logoUrl: string; brandColor: string; customDomain: string }; role: string; onSaved: (workspace: { name: string; logoUrl: string; brandColor: string; customDomain: string }) => void }) {
  const [form, setForm] = useState(workspace);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();
  useEffect(() => setForm(workspace), [workspace]);
  const save = async () => {
    setSaving(true);
    try { const result = await api<{ workspace: typeof form }>("/api/workspace", { method: "PATCH", body: JSON.stringify(form) }); onSaved(result.workspace); notify("Оформление пространства сохранено.", "success"); } catch { notify("Не удалось сохранить оформление пространства.", "error"); } finally { setSaving(false); }
  };
  return <section className="card" style={{ padding: 18 }}><div className="row"><div className="grow"><div className="section-label">Оформление пространства</div><div className="small muted">Роль: {localizeRole(role)}. Подключение собственного домена требует настройки DNS и сертификата.</div></div><span className="badge blue">Расширенное оформление</span></div><div className="row" style={{ gap: 10, alignItems: "end", marginTop: 12 }}><div className="field grow"><label>Название пространства</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="field"><label>Цвет бренда</label><input className="input" type="color" value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} /></div></div><div className="row" style={{ gap: 10 }}><div className="field grow"><label>URL логотипа</label><input className="input" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://cdn.example.com/logo.png" /></div><div className="field grow"><label>Свой домен</label><input className="input" value={form.customDomain} onChange={(e) => setForm({ ...form, customDomain: e.target.value })} placeholder="app.example.com" /></div></div><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Сохранение…" : "Сохранить оформление"}</button></section>;
}
