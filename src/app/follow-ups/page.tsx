"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/utils";

type Group = {
  dueToday: Array<Row>;
  upcoming: Array<Row>;
  completed: Array<Row>;
  pendingCount: number;
};
type Row = {
  id: string;
  dueDate: string;
  status: string;
  note: string;
  overdue: boolean;
  lead: { id: string; name: string; companyOrChannel: string; email: string | null };
};

export default function FollowUpsPage() {
  const [data, setData] = useState<Group | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ groups: Group }>("/api/follow-ups");
      setData(res.groups);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: string, dueDate?: string) => {
    try {
      await api("/api/follow-ups/action", {
        method: "POST", body: JSON.stringify({ id, action, dueDate }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
    }
  };

  if (error) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">Загрузка повторных контактов…</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Повторные контакты</h1>
          <p className="page-sub">
            {data.pendingCount === 0 ? "You're all caught up — no follow-ups due today." : `${data.pendingCount} pending follow-up(s).`}
          </p>
        </div>
      </div>

      <div className="stack" style={{ gap: 24 }}>
        <FollowUpList title="Due today" rows={data.dueToday} onAct={act} />
        <FollowUpList title="Upcoming (next 7 days)" rows={data.upcoming} onAct={act} />
        <FollowUpList title="Completed / skipped" rows={data.completed.slice(0, 50)} onAct={act} muted />
      </div>
    </div>
  );
}

function FollowUpList({
  title, rows, onAct, muted,
}: {
  title: string;
  rows: Row[];
  onAct: (id: string, action: string) => void;
  muted?: boolean;
}) {
  return (
    <section>
      <div className="section-label">{title} · {rows.length}</div>
      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">Nothing here.</div>
        ) : (
          rows.map((f) => (
            <div key={f.id} className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <div className="grow">
                <Link href={`/leads/${f.lead.id}`} style={{ fontWeight: 600 }}>{f.lead.name}</Link>
                <div className="small muted">{f.note}</div>
              </div>
              <span className={`small ${f.overdue ? "" : "muted"}`} style={{ color: f.overdue ? "var(--red)" : undefined }}>
                {formatDate(f.dueDate)}{muted ? "" : f.overdue ? " · overdue" : ""}
              </span>
              {!muted && (
                <div className="row">
                  <button className="btn btn-sm btn-primary" onClick={() => onAct(f.id, "complete")}>Выполнено</button>
                  <button className="btn btn-sm" onClick={() => onAct(f.id, "skip")}>Skip</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}