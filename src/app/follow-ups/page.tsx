"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/utils";

type Row = { id: string; dueDate: string; status: string; note: string; overdue: boolean; lead: { id: string; name: string; companyOrChannel: string; email: string | null } };
type Group = { dueToday: Row[]; upcoming: Row[]; completed: Row[]; pendingCount: number };

export default function FollowUpsPage() {
  const [data, setData] = useState<Group | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await api<{ groups: Group }>("/api/follow-ups");
      setData(response.groups);
    } catch {
      setError("Не удалось загрузить повторные контакты. Попробуйте обновить страницу.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: string, dueDate?: string) => {
    try {
      await api("/api/follow-ups/action", { method: "POST", body: JSON.stringify({ id, action, dueDate }) });
      await load();
    } catch {
      setError("Не удалось обновить задачу. Попробуйте ещё раз.");
    }
  };

  if (error) return <div className="empty-state card" role="alert"><div className="es-icon" aria-hidden>!</div><div className="es-title">Не удалось открыть задачи</div><div className="es-sub">{error}</div><button className="btn btn-primary" onClick={() => void load()}>Попробовать ещё раз</button></div>;
  if (!data) return <div className="card empty" aria-label="Загрузка повторных контактов">Загрузка задач…</div>;

  return <div>
    <div className="page-head"><div><h1 className="page-title">Повторные контакты</h1><p className="page-sub">{data.pendingCount === 0 ? "На сегодня всё готово." : `Сегодня нужно связаться с ${data.pendingCount} контактами.`}</p></div><Link href="/leads" className="btn">Открыть контакты</Link></div>
    <div className="stack follow-up-groups"><FollowUpList title="Сегодня" rows={data.dueToday} onAct={act} /><FollowUpList title="Ближайшие 7 дней" rows={data.upcoming} onAct={act} /><FollowUpList title="Завершённые и пропущенные" rows={data.completed.slice(0, 50)} onAct={act} muted /></div>
  </div>;
}

function FollowUpList({ title, rows, onAct, muted }: { title: string; rows: Row[]; onAct: (id: string, action: string) => void; muted?: boolean }) {
  return <section><div className="row follow-up-heading"><div className="section-label">{title}</div><span className="badge gray">{rows.length}</span></div><div className="card follow-up-list">{rows.length === 0 ? <div className="empty-state"><div className="es-title">Здесь пока ничего нет</div><div className="es-sub">Новые задачи появятся после отправки писем.</div></div> : rows.map((followUp) => <div key={followUp.id} className="row follow-up-row"><div className="grow"><Link href={`/leads/${followUp.lead.id}`} className="follow-up-name">{followUp.lead.name}</Link><div className="small muted">{followUp.note || followUp.lead.email || followUp.lead.companyOrChannel}</div></div><span className={`small ${followUp.overdue && !muted ? "follow-up-overdue" : "muted"}`}>{formatDate(followUp.dueDate)}{!muted && followUp.overdue ? " · просрочено" : ""}</span>{!muted && <div className="row follow-up-actions"><button className="btn btn-sm btn-primary" onClick={() => void onAct(followUp.id, "complete")}>Выполнено</button><button className="btn btn-sm" onClick={() => void onAct(followUp.id, "skip")}>Пропустить</button></div>}</div>)}</div></section>;
}
