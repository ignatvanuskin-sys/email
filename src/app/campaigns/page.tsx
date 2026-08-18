"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import FadeContent from "@/components/react-bits/FadeContent";
import { PageTransition } from "@/components/PageTransition";
import { uiLabel, campaignStatusLabels } from "@/lib/uiLabels";

type Campaign = {
  id: string;
  name: string;
  description: string;
  status: string;
  dailyLimit: number;
  createdAt: string;
  _count: { leads: number; variants: number };
};

const STATUS_STYLES: Record<string, string> = {
  Draft: "gray",
  Scheduled: "blue",
  Running: "green",
  Paused: "warm",
  Completed: "blue",
  Stopped: "red",
};

export default function CampaignsPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [data, setData] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ campaigns: Campaign[] }>("/api/campaigns");
      setData(res.campaigns);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить кампании");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: string) => {
    try {
      await api(`/api/campaigns/${id}/${action}`, { method: "POST" });
      notify(action === "start" ? "Кампания запущена" : action === "pause" ? "Кампания приостановлена" : "Кампания остановлена", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Действие не выполнено", "error");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Кампании" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text="Управляйте рассылками и отслеживайте результаты" speed={3} /></p>
        </div>
        <Link href="/campaigns/new" className="btn btn-primary">+ Новая кампания</Link>
      </div>

      {error && <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--red)" }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: 24 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 60, marginBottom: 10 }} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="card empty-state">
          <div className="es-icon" aria-hidden>📣</div>
          <div className="es-title">Кампаний пока нет</div>
          <div className="es-sub">Создайте первую кампанию, чтобы начать отправлять письма.</div>
          <Link href="/campaigns/new" className="btn btn-primary" style={{ marginTop: 12 }}>Создать кампанию</Link>
        </div>
      ) : (
        <PageTransition>
          <div className="stack" style={{ gap: 12 }}>
            {data.map((c) => (
              <FadeContent key={c.id}>
                <div className="card surface-hover" style={{ padding: 16, cursor: "pointer" }} onClick={() => router.push(`/campaigns/${c.id}`)}>
                  <div className="row">
                    <div className="grow">
                      <div style={{ fontWeight: 650, fontSize: 16 }}>{c.name}</div>
                      <div className="small muted" style={{ marginTop: 2 }}>{c.description || "Без описания"}</div>
                    </div>
                    <span className={`badge ${STATUS_STYLES[c.status] || "gray"}`}>{uiLabel(campaignStatusLabels, c.status)}</span>
                  </div>
                  <div className="row" style={{ marginTop: 10, gap: 16 }}>
                    <span className="small muted">Лидов: {c._count.leads}</span>
                    <span className="small muted">Вариантов: {c._count.variants}</span>
                    <span className="small muted">{new Date(c.createdAt).toLocaleDateString()}</span>
                    <span className="grow" />
                    {c.status === "Draft" && (
                        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); act(c.id, "start"); }}>Запустить</button>
                    )}
                    {c.status === "Running" && (
                      <>
                         <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); act(c.id, "pause"); }}>Пауза</button>
                         <button className="btn btn-sm btn-outline-danger" onClick={(e) => { e.stopPropagation(); act(c.id, "stop"); }}>Остановить</button>
                      </>
                    )}
                    {c.status === "Paused" && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); act(c.id, "start"); }}>Возобновить</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={(e) => { e.stopPropagation(); act(c.id, "stop"); }}>Остановить</button>
                      </>
                    )}
                    {c.status === "Running" && (
                       <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); api(`/api/campaigns/${c.id}/send`, { method: "POST" }).then(() => { notify("Пакет отправлен", "success"); load(); }).catch((err) => notify(err.message, "error")); }}>Отправить пакет</button>
                    )}
                  </div>
                </div>
              </FadeContent>
            ))}
          </div>
        </PageTransition>
      )}
    </div>
  );
}
