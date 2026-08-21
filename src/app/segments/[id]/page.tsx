"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { leadStatusLabels, uiLabel } from "@/lib/uiLabels";
import BlurText from "@/components/react-bits/BlurText";
import FadeContent from "@/components/react-bits/FadeContent";

type Lead = {
  id: string;
  name: string;
  email: string | null;
  leadScore: number;
  status: string;
};

export default function SegmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ segment: { name: string; description: string }; leads: Lead[] }>(`/api/segments/${params.id}`);
      setName(res.segment.name);
      setDescription(res.segment.description);
      setLeads(res.leads);
    } catch (e) {
      setError("Не удалось загрузить группу контактов. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api(`/api/segments/${params.id}`, { method: "PATCH", body: JSON.stringify({ name, description }) });
      notify("Группа контактов обновлена.", "success");
    } catch (e) {
      notify("Не удалось сохранить изменения.", "error");
    }
  };

  const del = async () => {
    if (!window.confirm("Удалить эту группу контактов?")) return;
    try {
      await api(`/api/segments/${params.id}`, { method: "DELETE" });
      notify("Группа контактов удалена.", "success");
      router.push("/segments");
    } catch (e) {
      notify("Не удалось удалить группу контактов.", "error");
    }
  };

  if (loading) return <div className="card" style={{ padding: 24 }}><div className="skeleton" style={{ height: 40 }} /></div>;
  if (error) return <div className="empty">{error}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text={name || "Группа контактов"} className="page-title" delay={40} animateBy="words" />
          <p className="page-sub">{description || "Своя группа контактов"}</p>
        </div>
        <div className="row">
          <Link href="/segments" className="btn btn-ghost">← Назад</Link>
          <button className="btn btn-outline-danger" onClick={del}>Удалить</button>
        </div>
      </div>

      <FadeContent>
        <div className="card" style={{ maxWidth: 620, padding: 20, marginBottom: 20 }}>
          <div className="field">
            <label>Название</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Описание</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={save}>Сохранить изменения</button>
        </div>
      </FadeContent>

      <div className="section-label">Контакты в группе · {leads.length}</div>
      <div className="card" style={{ overflow: "hidden" }}>
        {leads.length === 0 ? (
          <div className="empty-state">
            <div className="es-title">В группе пока нет контактов</div>
            <div className="es-sub">Измените фильтры, чтобы расширить аудиторию.</div>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 400 }}>
            <table className="data-table">
              <thead>
                <tr><th>Имя</th><th>Электронная почта</th><th>Оценка</th><th>Статус</th></tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td data-label="Имя"><Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.name}</Link></td>
                    <td data-label="Электронная почта">{l.email || <span className="muted">—</span>}</td>
                    <td data-label="Оценка"><span className={`badge ${l.leadScore >= 80 ? "hot" : l.leadScore >= 50 ? "warm" : "cold"}`}>{l.leadScore}</span></td>
                    <td data-label="Статус">{uiLabel(leadStatusLabels, l.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}