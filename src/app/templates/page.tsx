"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { formatDate } from "@/lib/utils";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import FadeContent from "@/components/react-bits/FadeContent";
import SpotlightCard from "@/components/react-bits/SpotlightCard";
import { PageTransition } from "@/components/PageTransition";

type Template = {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  createdAt: string;
};

const CATEGORIES = ["All", "Cold outreach", "Partnership", "YouTube", "Telegram", "Agency", "Follow-up", "Custom"];

export default function TemplatesPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [data, setData] = useState<Template[]>([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ templates: Template[] }>("/api/templates");
      setData(res.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = category === "All" ? data : data.filter((t) => t.category === category);

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    try {
      await api(`/api/templates/${id}`, { method: "DELETE" });
      notify("Template deleted", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Шаблоны" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text="Reusable email templates for your sequences" speed={3} /></p>
        </div>
        <Link href="/templates/new" className="btn btn-primary">+ Новый шаблон</Link>
      </div>

      {error && <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--red)" }}>{error}</div>}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`btn btn-sm ${category === c ? "btn-primary" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 24 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 80, marginBottom: 10 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="es-icon" aria-hidden>📄</div>
          <div className="es-title">Шаблоны не найдены</div>
          <div className="es-sub">{data.length === 0 ? "Создайте первый шаблон для повторного использования в цепочках." : "Попробуйте изменить фильтр категории."}</div>
          {data.length === 0 && <Link href="/templates/new" className="btn btn-primary" style={{ marginTop: 12 }}>Создать шаблон</Link>}
        </div>
      ) : (
        <PageTransition>
          <div className="stack" style={{ gap: 12 }}>
            {filtered.map((t) => (
              <FadeContent key={t.id}>
                <SpotlightCard>
                  <div className="card" style={{ padding: 16 }}>
                    <div className="row" style={{ marginBottom: 8 }}>
                      <div className="grow">
                        <span style={{ fontWeight: 650, fontSize: 16 }}>{t.name}</span>
                        <span className="badge" style={{ marginLeft: 8 }}>{t.category}</span>
                      </div>
                      <span className="small muted">{formatDate(t.createdAt)}</span>
                    </div>
                    <div className="small" style={{ fontWeight: 500, marginBottom: 4 }}>{t.subject}</div>
                    <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                      {t.body.length > 80 ? t.body.slice(0, 80) + "..." : t.body}
                    </div>
                    <div className="row" style={{ marginTop: 10, gap: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => router.push(`/templates/${t.id}`)}>Edit</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => remove(t.id, t.name)}>Удалить</button>
                    </div>
                  </div>
                </SpotlightCard>
              </FadeContent>
            ))}
          </div>
        </PageTransition>
      )}
    </div>
  );
}
