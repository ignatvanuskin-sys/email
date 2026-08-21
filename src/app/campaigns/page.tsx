"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { uiLabel, campaignStatusLabels } from "@/lib/uiLabels";

type Campaign = { id: string; name: string; description: string; status: string; dailyLimit: number; createdAt: string; _count: { leads: number; variants: number } };
const STATUS_STYLES: Record<string, string> = { Draft: "gray", Scheduled: "blue", Running: "green", Paused: "warm", Completed: "blue", Stopped: "red" };

export default function CampaignsPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await api<{ campaigns: Campaign[] }>("/api/campaigns");
      setCampaigns(response.campaigns);
    } catch {
      setError("Не удалось загрузить рассылки. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: "start" | "pause" | "stop" | "send") => {
    try {
      await api(`/api/campaigns/${id}/${action === "send" ? "send" : action}`, { method: "POST" });
      notify(action === "start" ? "Рассылка запущена." : action === "pause" ? "Рассылка приостановлена." : action === "stop" ? "Рассылка остановлена." : "Письма поставлены в очередь.", "success");
      await load();
    } catch {
      notify("Не удалось выполнить действие. Откройте рассылку и проверьте её настройки.", "error");
    }
  };

  return (
    <div>
      <div className="page-head"><div><h1 className="page-title">Рассылки</h1><p className="page-sub">Создавайте письма, проверяйте их и запускайте, когда будете готовы.</p></div><Link href="/campaigns/new" className="btn btn-primary">＋ Новая рассылка</Link></div>
      {error && <div className="card friendly-error" role="alert">{error}</div>}
      {loading ? <div className="card" style={{ padding: 24 }}>{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 76, marginBottom: 10 }} />)}</div> : campaigns.length === 0 ? <div className="card empty-state"><div className="es-icon" aria-hidden>✦</div><div className="es-title">Рассылок пока нет</div><div className="es-sub">Создайте первую рассылку — система проведёт вас через проверку перед отправкой.</div><Link href="/campaigns/new" className="btn btn-primary">Создать рассылку</Link></div> : <div className="stack campaign-list">{campaigns.map((campaign) => <article key={campaign.id} className="card campaign-card" onClick={() => router.push(`/campaigns/${campaign.id}`)}>
        <div className="row campaign-card-header"><div className="grow"><strong>{campaign.name}</strong><div className="small muted campaign-description">{campaign.description || "Описание не добавлено"}</div></div><span className={`badge ${STATUS_STYLES[campaign.status] || "gray"}`}>{uiLabel(campaignStatusLabels, campaign.status)}</span></div>
        <div className="row campaign-card-meta"><span>Контактов: {campaign._count.leads}</span><span>Вариантов письма: {campaign._count.variants}</span><span>Лимит: {campaign.dailyLimit}/день</span><span className="grow" /><Link href={`/campaigns/${campaign.id}`} className="btn btn-sm">Открыть</Link>{campaign.status === "Draft" && <button className="btn btn-sm btn-primary" onClick={(event) => { event.stopPropagation(); void act(campaign.id, "start"); }}>Запустить</button>}{campaign.status === "Running" && <><button className="btn btn-sm" onClick={(event) => { event.stopPropagation(); void act(campaign.id, "pause"); }}>Пауза</button><button className="btn btn-sm" onClick={(event) => { event.stopPropagation(); void act(campaign.id, "send"); }}>Отправить</button></>}{campaign.status === "Paused" && <><button className="btn btn-sm btn-primary" onClick={(event) => { event.stopPropagation(); void act(campaign.id, "start"); }}>Возобновить</button><button className="btn btn-sm btn-outline-danger" onClick={(event) => { event.stopPropagation(); void act(campaign.id, "stop"); }}>Остановить</button></>}</div>
      </article>)}</div>}
    </div>
  );
}
