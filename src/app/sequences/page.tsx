"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/utils";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";
import FadeContent from "@/components/react-bits/FadeContent";
import { PageTransition } from "@/components/PageTransition";

type Sequence = {
  id: string;
  name: string;
  createdAt: string;
  _count: { steps: number };
};

export default function SequencesPage() {
  const router = useRouter();
  const [data, setData] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ sequences: Sequence[] }>("/api/sequences");
      setData(res.sequences);
    } catch (e) {
      setError("Не удалось загрузить автоматические цепочки. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Автоматические цепочки" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text="Автоматизируйте повторные письма в несколько шагов" speed={3} /></p>
        </div>
        <Link href="/sequences/new" className="btn btn-primary">＋ Новая цепочка</Link>
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
          <div className="es-icon" aria-hidden>🔁</div>
          <div className="es-title">Цепочек пока нет</div>
          <div className="es-sub">Создайте цепочку, чтобы автоматизировать повторные письма.</div>
          <Link href="/sequences/new" className="btn btn-primary" style={{ marginTop: 12 }}>Создать цепочку</Link>
        </div>
      ) : (
        <PageTransition>
          <div className="stack" style={{ gap: 12 }}>
            {data.map((s) => (
              <FadeContent key={s.id}>
                <div className="card surface-hover" style={{ padding: 16, cursor: "pointer" }} onClick={() => router.push(`/sequences/${s.id}`)}>
                  <div className="row">
                    <div className="grow">
                      <div style={{ fontWeight: 650, fontSize: 16 }}>{s.name}</div>
                    </div>
                    <span className="small muted">{s._count.steps} шагов</span>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <span className="small muted">Создана: {formatDate(s.createdAt)}</span>
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