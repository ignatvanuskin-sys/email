"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import SpotlightCard from "@/components/react-bits/SpotlightCard";

type Provider = {
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
  const [providers, setProviders] = useState<Provider[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKind, setSavingKind] = useState<"email" | "ai" | null>(null);
  const { notify } = useToast();

  const load = useCallback(async () => {
    try {
      const [me, prov, sup] = await Promise.all([
        api<{ user: { outreachPaused: boolean } }>("/api/auth/me"),
        api<{ providers: Provider[] }>("/api/settings/providers"),
        api<{ entries: Suppression[] }>("/api/suppressions"),
      ]);
      setPaused(me.user.outreachPaused);
      setProviders(prov.providers);
      console.info("[settings] providers loaded", prov.providers.map((p) => ({ id: p.id, kind: p.kind, configured: p.configured, isActive: p.isActive })));
      setSuppressions(sup.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePause = async () => {
    const next = !paused;
    if (next && !window.confirm("STOP ALL OUTREACH? No new emails will be sent until you resume.")) return;
    await api("/api/settings/pause", { method: "POST", body: JSON.stringify({ paused: next }) });
    setPaused(next);
    notify(next ? "Outreach paused." : "Outreach resumed.", "info");
  };

  const removeProvider = async (id: string) => {
    try {
      setError("");
      await api(`/api/settings/providers?id=${id}`, { method: "DELETE" });
      setNotice("Провайдер удалён.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить провайдера");
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

  const saveProvider = async (body: Record<string, unknown>) => {
    const kind = body.type === "email" ? "email" : "ai";
    setSavingKind(kind);
    setNotice("");
    setError("");
    try {
      const response = await api<{ provider: Provider }>("/api/settings/providers", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setProviders((current) => {
        const saved = response.provider;
        return [saved, ...current.filter((p) => !(p.kind === saved.kind && p.id !== saved.id))];
      });
      await load();
      setNotice("Провайдер сохранён.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
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
          <div className="section-label">Global pause — safety control</div>
          <SpotlightCard className="card" spotlightColor="rgba(217, 119, 6, 0.15)">
            <div style={{ padding: 18 }}>
              <p className="small muted" style={{ marginTop: 0 }}>Immediately stop placing new emails for sending.</p>
              <button className={`pause-control ${paused ? "paused" : "active"}`} onClick={togglePause} aria-pressed={paused}>
                <span className={`pulse-dot ${paused ? "paused" : "live"}`} aria-hidden />
                <span className="pause-label">{paused ? "OUTREACH PAUSED" : "OUTREACH ACTIVE"}</span>
                <span aria-hidden>{paused ? "▶ Resume" : "⏹ Pause all"}</span>
              </button>
            </div>
          </SpotlightCard>
        </section>

        <section>
          <div className="section-label">Connection status</div>
          <div className="card" style={{ padding: 18 }}>
            <div className="stack" style={{ gap: 10, marginTop: 8 }}>
              <StatusRow label="Email provider" connected={providers.some((p) => p.kind === "email" && p.configured)} detail="SMTP credentials encrypted at rest" />
              <StatusRow label="AI provider" connected={providers.some((p) => p.kind === "ai" && p.configured)} detail="API key encrypted, never returned" />
              <StatusRow label="Authentication" connected detail="Session secured via HTTP-only cookie" />
            </div>
          </div>
        </section>

        <ProviderPane label="Почтовый провайдер" providers={providers.filter((p) => p.kind === "email")} onRemove={removeProvider}>
          <EmailForm onSave={saveProvider} saving={savingKind === "email"} savedProvider={providers.find((p) => p.kind === "email" && p.isActive)} />
        </ProviderPane>

        <ProviderPane label="AI-провайдер" providers={providers.filter((p) => p.kind === "ai")} onRemove={removeProvider}>
          <AiForm onSave={saveProvider} saving={savingKind === "ai"} savedProvider={providers.find((p) => p.kind === "ai" && p.isActive)} />
        </ProviderPane>

        <section>
          <div className="section-label">Suppression list</div>
          <SpotlightCard className="card" spotlightColor="rgba(220, 38, 38, 0.14)">
            <div style={{ padding: 18 }}>
              <p className="small muted" style={{ marginTop: 0 }}>
                Emails here can never receive outbound mail from you (hard gate on the API). Unsubscribe and hard
                bounces land here automatically.
              </p>
              <AddEmail onAdd={addSuppression} />
              <div className="stack" style={{ marginTop: 12 }}>
                {suppressions.length === 0 ? (
                  <div className="small muted">No suppressed addresses.</div>
                ) : (
                  suppressions.map((s) => (
                    <div key={s.id} className="row">
                      <span className="grow">{s.email}</span>
                      <span className={`badge ${s.reason === "Unsubscribed" ? "red" : "gray"}`}>{s.reason}</span>
                      <button className="btn btn-sm btn-ghost-danger" onClick={() => removeSuppression(s.id)}>Remove</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </SpotlightCard>
        </section>

        <section>
          <div className="section-label">Security</div>
          <div className="card" style={{ padding: 18 }}>
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              <div className="row"><span className="grow">Passwords</span><span className="badge green">bcrypt-hashed</span></div>
              <div className="row"><span className="grow">Provider credentials</span><span className="badge green">Encrypted at rest</span></div>
              <div className="row"><span className="grow">Suppression hard gate</span><span className="badge blue">Enforced on send</span></div>
              <div className="row"><span className="grow">Human approval</span><span className="badge blue">Required before send</span></div>
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
      <span className={`badge ${connected ? "green" : "gray"}`}>{connected ? "Connected" : "Not connected"}</span>
      <span className="small muted">{detail}</span>
    </div>
  );
}

function ProviderPane({ label, providers, onRemove, children }: {
  label: string; providers: Provider[]; onRemove: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="section-label">{label}</div>
      <div className="stack" style={{ marginBottom: 12 }}>
        {providers.length === 0 ? (
          <div className="small muted">Not connected. Configure a provider before using this feature.</div>
        ) : (
          providers.map((p, index) => (
            <div key={`${p.kind}-${p.id}-${index}`} className="row">
              <span className="grow">Provider {p.isActive && <span className="badge green">active</span>}</span>
              <span className="small muted">limit {p.dailyLimit}/day</span>
              <button className="btn btn-sm btn-ghost-danger" onClick={() => onRemove(p.id)}>Remove</button>
            </div>
          ))
        )}
      </div>
      {children}
    </section>
  );
}
function EmailForm({ onSave, saving, savedProvider }: { onSave: (b: Record<string, unknown>) => void; saving: boolean; savedProvider?: Provider }) {
  const [form, setForm] = useState({ host: "smtp.gmail.com", port: "587", user: "", pass: "", from: "" });
  useEffect(() => {
    if (!savedProvider?.safeConfig) return;
    setForm((current) => ({ ...current, host: savedProvider.safeConfig?.host ?? current.host, port: String(savedProvider.safeConfig?.port ?? current.port), user: savedProvider.safeConfig?.user ?? current.user, from: savedProvider.safeConfig?.from ?? current.from, pass: "" }));
  }, [savedProvider]);
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
        <div className="field grow"><label>Host</label><input className="input" value={form.host} onChange={set("host")} placeholder="smtp.example.com" required /></div>
        <div className="field" style={{ width: 90 }}><label>Port</label><input className="input" value={form.port} onChange={set("port")} /></div>
      </div>
      <div className="row">
        <div className="field grow"><label>Username</label><input className="input" value={form.user} onChange={set("user")} required /></div>
        <div className="field grow"><label>Password</label><input className="input" type="password" value={form.pass} onChange={set("pass")} required={!savedProvider?.configured} placeholder={savedProvider?.configured ? "Сохранённый пароль защищён; оставьте пустым, чтобы не менять" : "App password"} /></div>
      </div>
      <div className="field"><label>From address</label><input className="input" value={form.from} onChange={set("from")} placeholder="you@example.com" /></div>
      {savedProvider?.configured && <div className="small" style={{ color: "var(--green)", marginBottom: 8 }}>SMTP is configured. Secret fields stay blank for security.</div>}
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : savedProvider ? "Update SMTP provider" : "Save SMTP provider"}</button>
    </form>
  );
}

function AiForm({ onSave, saving, savedProvider }: { onSave: (b: Record<string, unknown>) => void; saving: boolean; savedProvider?: Provider }) {
  const hasSavedProvider = Boolean(savedProvider?.configured);
  type Model = { id: string; name: string; provider: string; contextLength: number | null; isFree: boolean; status: string };
  const [platform, setPlatform] = useState("OpenAI");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  useEffect(() => {
    if (!savedProvider?.safeConfig) return;
    setModel(savedProvider.safeConfig.model ?? "");
    if (savedProvider.platform) setPlatform(savedProvider.platform);
  }, [savedProvider]);
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

  const testConnection = async () => {
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
      if (hasSavedProvider && !apiKey) {
        onSave({ type: "ai", platform, config: JSON.stringify({ platform }), dailyLimit: 50 });
        return;
      }
      onSave({ type: "ai", platform, config: JSON.stringify({ platform, apiKey, model }), dailyLimit: 50 });
    }}>
      <div className="field"><label>AI-провайдер</label>
        <select className="select" value={platform} onChange={(e) => { setPlatform(e.target.value); setModel(""); }}>
          <option value="OpenAI">OpenAI</option>
          <option value="OpenRouter">OpenRouter</option>
        </select>
      </div>
      <div className="field"><label>API-ключ</label><input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasSavedProvider ? "Сохранённый ключ защищён; оставьте пустым, чтобы не менять" : "Введите ключ при первичном подключении"} required={!hasSavedProvider} /></div>
      {platform === "OpenRouter" ? <>
        <label className="row small"><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Только бесплатные модели</label>
        <div className="field"><label>Модель</label><select className="select" value={model} onChange={(e) => setModel(e.target.value)} required={!hasSavedProvider}>
          <option value="">Выберите модель</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.provider}{m.isFree ? " — бесплатно" : ""}{m.contextLength ? ` — контекст ${m.contextLength.toLocaleString("ru-RU")}` : ""} — {m.status === "available" ? "доступна" : "статус неизвестен"}</option>)}
        </select></div>
        <button className="btn" type="button" disabled={testing || !model} onClick={testConnection}>{testing ? "Проверка…" : "Проверить подключение"}</button>
      </> : <div className="field"><label>Модель (необязательно)</label><input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="автоматически" /></div>}
      {message && <div className="small muted">{message}</div>}
      {savedProvider?.configured && <div className="small" style={{ color: "var(--green)", marginBottom: 8 }}>AI provider is configured. The API key is never shown again.</div>}
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Сохранение…" : savedProvider ? "Обновить AI-провайдера" : "Сохранить AI-провайдера"}</button>
    </form>
  );
}

function AddEmail({ onAdd }: { onAdd: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (email.trim()) { onAdd(email.trim()); setEmail(""); } }}>
      <input className="input grow" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="blocked@example.com" />
      <button className="btn btn-primary">Block</button>
    </form>
  );
}