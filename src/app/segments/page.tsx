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

type Segment = {
  id: string;
  name: string;
  description: string;
  filters: string;
  createdAt: string;
};

type Lead = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  leadScore: number;
};

const PRESETS: Array<{ name: string; desc: string; q: string }> = [
  { name: "Все контакты", desc: "Все контакты в вашей воронке", q: "" },
  { name: "Горячие контакты", desc: "Оценка 80+", q: "tier=HOT" },
  { name: "Без контакта", desc: "Статус: Новый", q: "status=New" },
  { name: "Были на связи", desc: "Статус: Связались", q: "status=Contacted" },
  { name: "Ответили", desc: "Статус: Ответил", q: "status=Replied" },
];

export default function SegmentsPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ segments: Segment[] }>("/api/segments");
      setSegments(res.segments);
      const leads = await api<{ leads: Lead[] }>("/api/leads");
      setCounts({
        "Все контакты": leads.leads.length,
        "Горячие контакты": leads.leads.filter((l) => l.leadScore >= 80).length,
        "Без контакта": leads.leads.filter((l) => l.status === "New").length,
        "Были на связи": leads.leads.filter((l) => l.status === "Contacted").length,
        Ответили: leads.leads.filter((l) => l.status === "Replied").length,
      });
    } catch (e) {
      setError("Не удалось загрузить группы контактов. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    if (!window.confirm("Удалить эту группу контактов?")) return;
    try {
      await api(`/api/segments/${id}`, { method: "DELETE" });
      notify("Группа контактов удалена.", "success");
      await load();
    } catch (e) {
      notify("Не удалось удалить группу контактов.", "error");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Группы контактов" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text="Собирайте аудитории для рассылок с помощью фильтров" speed={3} /></p>
        </div>
        <Link href="/segments/new" className="btn btn-primary">＋ Новая группа</Link>
      </div>

      {error && <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--red)" }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: 24 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 50, marginBottom: 10 }} />
          ))}
        </div>
      ) : (
        <PageTransition>
          <div className="stack" style={{ gap: 14 }}>
            <div className="section-label">Готовые группы</div>
            <div className="metric-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              {PRESETS.map((p) => (
                <div key={p.name} className="kpi" style={{ cursor: "pointer" }} onClick={() => router.push(`/leads?${p.q}`)}>
                  <div className="kpi-icon" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }} aria-hidden>◈</div>
                  <div className="label">{p.name}</div>
                  <div className="value">{counts[p.name] ?? "—"}</div>
                  <div className="small muted" style={{ marginTop: 4 }}>{p.desc}</div>
                </div>
              ))}
            </div>

            <div className="section-label" style={{ marginTop: 8 }}>Свои группы</div>
            {segments.length === 0 ? (
              <div className="card empty-state">
                <div className="es-icon" aria-hidden>🎯</div>
                <div className="es-title">Своих групп пока нет</div>
                <div className="es-sub">Создайте группу, чтобы повторно использовать фильтры в рассылках.</div>
                <Link href="/segments/new" className="btn btn-primary" style={{ marginTop: 12 }}>Создать группу</Link>
              </div>
            ) : (
              segments.map((s) => {
                let filterCount = 0;
                try { filterCount = JSON.parse(s.filters || "[]").length; } catch { /* ignore */ }
                return (
                  <FadeContent key={s.id}>
                    <div className="card surface-hover" style={{ padding: 16, cursor: "pointer" }} onClick={() => router.push(`/segments/${s.id}`)}>
                      <div className="row">
                        <div className="grow">
                          <div style={{ fontWeight: 650 }}>{s.name}</div>
                          <div className="small muted">{s.description || "Без описания"}</div>
                        </div>
                        <span className="badge blue">{filterCount} фильтров</span>
                        <button className="btn btn-sm btn-ghost-danger" onClick={(e) => { e.stopPropagation(); del(s.id); }}>Удалить</button>
                      </div>
                    </div>
                  </FadeContent>
                );
              })
            )}
          </div>
        </PageTransition>
      )}
    </div>
  );
}