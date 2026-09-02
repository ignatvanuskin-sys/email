"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";

type Reply = { id: string; classification: string; contentSnippet: string; isRead: boolean; receivedAt: string; lead: { id: string; name: string; email: string | null; companyOrChannel: string } };
const CLASSIFICATIONS = [{ value: "", label: "Все ответы" }, { value: "Положительный", label: "Положительные" }, { value: "Заинтересован", label: "Заинтересованные" }, { value: "Отрицательный", label: "Отрицательные" }, { value: "NotNow", label: "Не сейчас" }, { value: "Ответил", label: "Ответили" }];

export default function InboxPage() {
  const { notify } = useToast();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [q, setQ] = useState("");
  const [classification, setClassification] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await api<{ replies: Reply[] }>(`/api/inbox?q=${encodeURIComponent(q)}&classification=${encodeURIComponent(classification)}`);
      setReplies(result.replies);
    } catch {
      notify("Не удалось загрузить ответы. Попробуйте обновить страницу.", "error");
    } finally {
      setLoading(false);
    }
  }, [q, classification, notify]);

  useEffect(() => { void load(); }, [load]);

  const update = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/inbox/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch {
      notify("Не удалось обновить ответ.", "error");
    }
  };

  return <div>
    <div className="page-head"><div><h1 className="page-title">Ответы</h1><p className="page-sub">Здесь появляются ответы на ваши письма. Отметьте важные и переходите к контакту.</p></div></div>
    <div className="toolbar inbox-toolbar"><input className="input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск по ответам или контактам" aria-label="Поиск ответов" /><select className="select" value={classification} onChange={(event) => setClassification(event.target.value)} aria-label="Фильтр ответов">{CLASSIFICATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
    {loading ? <div className="card" style={{ padding: 24 }}>{Array.from({ length: 4 }).map((_, index) => <div className="skeleton" key={index} style={{ height: 70, marginBottom: 10 }} />)}</div> : <div className="card inbox-list">{replies.length === 0 ? <div className="empty-state"><div className="es-icon" aria-hidden>✉</div><div className="es-title">Ответов пока нет</div><div className="es-sub">Когда контакт ответит на письмо, сообщение появится здесь.</div><Link href="/campaigns" className="btn btn-primary">Открыть рассылки</Link></div> : replies.map((reply) => <article className={`inbox-row ${reply.isRead ? "is-read" : ""}`} key={reply.id}><div className="grow"><div><Link href={`/leads/${reply.lead.id}`} className="inbox-name">{reply.lead.name}</Link><span className="small muted"> · {reply.lead.email || reply.lead.companyOrChannel}</span></div><p className="small inbox-snippet">{reply.contentSnippet}</p><div className="small muted">{new Date(reply.receivedAt).toLocaleString("ru-RU")}</div></div><span className={`badge ${reply.classification === "Положительный" || reply.classification === "Заинтересован" ? "green" : reply.classification === "Отрицательный" ? "red" : "gray"}`}>{localizeReply(reply.classification)}</span><div className="stack inbox-actions"><button className="btn btn-sm" onClick={() => void update(reply.id, { isRead: !reply.isRead })}>{reply.isRead ? "Вернуть как непрочитанное" : "Отметить прочитанным"}</button><button className="btn btn-sm" onClick={() => void update(reply.id, { archived: true })}>Скрыть</button></div></article>)}</div>}
  </div>;
}

function localizeReply(value: string): string {
  const labels: Record<string, string> = { Positive: "Положительный", Negative: "Отрицательный", Interested: "Заинтересован", NotNow: "Не сейчас", Replied: "Ответил" };
  return labels[value] ?? value;
}
