"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";

type DnsRecord = { type: string; host: string; value: string };
type SendingDomain = {
  id: string;
  domain: string;
  selector: string;
  spfStatus: string;
  dkimStatus: string;
  dmarcStatus: string;
  overallStatus: string;
  lastError: string | null;
  lastCheckedAt: string | null;
  records: { spf: DnsRecord; dkim: DnsRecord; dmarc: DnsRecord };
};

export default function DeliverabilityPage() {
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const { notify } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await api<{ domains: SendingDomain[] }>("/api/sending-domains");
      setDomains(data.domains);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось загрузить домены", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      await api("/api/sending-domains", { method: "POST", body: JSON.stringify({ domain }) });
      setDomain("");
      notify("Домен добавлен. Разместите DNS-записи ниже.", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось добавить домен", "error");
    } finally {
      setCreating(false);
    }
  };

  const verify = async (id: string) => {
    setChecking(id);
    try {
      const data = await api<{ domain: SendingDomain }>(`/api/sending-domains/${id}/verify`, { method: "POST" });
      setDomains((current) => current.map((item) => item.id === id ? data.domain : item));
      notify(data.domain.overallStatus === "Verified" ? "Все DNS-записи подтверждены." : "DNS проверен: часть записей требует внимания.", data.domain.overallStatus === "Verified" ? "success" : "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "DNS-проверка не удалась", "error");
    } finally {
      setChecking(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Удалить домен и его DKIM-ключ?")) return;
    try {
      await api(`/api/sending-domains/${id}`, { method: "DELETE" });
      setDomains((current) => current.filter((item) => item.id !== id));
      notify("Домен удалён.", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось удалить домен", "error");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Центр доставляемости</h1>
          <p className="page-sub">Подтвердите домен отправителя до запуска массовой рассылки.</p>
        </div>
      </div>

      <form className="card row" style={{ padding: 18, marginBottom: 20, alignItems: "end" }} onSubmit={create}>
        <div className="field grow" style={{ margin: 0 }}>
          <label>Домен отправителя</label>
          <input className="input" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" required />
        </div>
        <button className="btn btn-primary" disabled={creating}>{creating ? "Создание..." : "Добавить домен"}</button>
      </form>

      {loading ? <div className="card empty">Загрузка...</div> : domains.length === 0 ? (
        <div className="card empty">Добавьте первый домен, чтобы получить SPF, DKIM и DMARC записи.</div>
      ) : <div className="stack" style={{ gap: 18 }}>
        {domains.map((item) => <DomainCard key={item.id} item={item} checking={checking === item.id} onVerify={() => verify(item.id)} onRemove={() => remove(item.id)} />)}
      </div>}
    </div>
  );
}

function DomainCard({ item, checking, onVerify, onRemove }: { item: SendingDomain; checking: boolean; onVerify: () => void; onRemove: () => void }) {
  const checks = [
    { label: "SPF опубликован", ready: item.spfStatus === "Verified" },
    { label: "DKIM совпадает", ready: item.dkimStatus === "Verified" },
    { label: "DMARC опубликован", ready: item.dmarcStatus === "Verified" },
    { label: "Домен готов к первой отправке", ready: item.overallStatus === "Verified" },
  ];

  return <section className="card" style={{ padding: 20 }}>
    <div className="row" style={{ alignItems: "start", marginBottom: 16 }}>
      <div className="grow">
        <h2 style={{ margin: 0, fontSize: 20 }}>{item.domain}</h2>
        <div className="small muted">Selector: {item.selector} · Последняя проверка: {item.lastCheckedAt ? new Date(item.lastCheckedAt).toLocaleString("ru-RU") : "ещё не запускалась"}</div>
      </div>
      <Status value={item.overallStatus} />
      <button className="btn btn-primary" onClick={onVerify} disabled={checking}>{checking ? "Проверка..." : "Проверить DNS"}</button>
      <button className="btn btn-outline-danger" onClick={onRemove}>Удалить</button>
    </div>

    {item.lastError && <div className="small" style={{ color: "var(--red)", marginBottom: 12 }}>DNS error: {item.lastError}</div>}

    <div className="stack" style={{ gap: 10 }}>
      <RecordRow label="SPF" status={item.spfStatus} record={item.records.spf} />
      <RecordRow label="DKIM" status={item.dkimStatus} record={item.records.dkim} />
      <RecordRow label="DMARC" status={item.dmarcStatus} record={item.records.dmarc} />
    </div>

    <div style={{ marginTop: 18 }}>
      <div className="section-label">Чек-лист перед первой отправкой</div>
      <div className="stack" style={{ gap: 8 }}>
        {checks.map((check) => <div className="row small" key={check.label}><span className={`badge ${check.ready ? "green" : "gray"}`}>{check.ready ? "Готово" : "Ожидает"}</span><span>{check.label}</span></div>)}
      </div>
    </div>
  </section>;
}

function RecordRow({ label, status, record }: { label: string; status: string; record: DnsRecord }) {
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); };
  return <div className="card" style={{ padding: 12, background: "var(--surface-2)" }}>
    <div className="row" style={{ marginBottom: 8 }}><strong>{label}</strong><Status value={status} /></div>
    <div className="small muted">{record.type} · Host</div>
    <div className="row"><code className="grow" style={{ overflowWrap: "anywhere" }}>{record.host}</code><button className="btn btn-sm" onClick={() => copy(record.host)}>Копировать</button></div>
    <div className="small muted" style={{ marginTop: 8 }}>Value</div>
    <div className="row"><code className="grow" style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}>{record.value}</code><button className="btn btn-sm" onClick={() => copy(record.value)}>Копировать</button></div>
  </div>;
}

function Status({ value }: { value: string }) {
  const className = value === "Verified" ? "green" : value === "Pending" ? "gray" : "red";
  return <span className={`badge ${className}`}>{value}</span>;
}
