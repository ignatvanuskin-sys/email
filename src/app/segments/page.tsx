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
  { name: "All leads", desc: "Every prospect in your pipeline", q: "" },
  { name: "Hot leads", desc: "Score 80+", q: "tier=HOT" },
  { name: "Never contacted", desc: "Status is New", q: "status=New" },
  { name: "Contacted", desc: "Status is Contacted", q: "status=Contacted" },
  { name: "Replied", desc: "Status is Replied", q: "status=Replied" },
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
        "All leads": leads.leads.length,
        "Hot leads": leads.leads.filter((l) => l.leadScore >= 80).length,
        "Never contacted": leads.leads.filter((l) => l.status === "New").length,
        Contacted: leads.leads.filter((l) => l.status === "Contacted").length,
        Replied: leads.leads.filter((l) => l.status === "Replied").length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    if (!window.confirm("Delete this segment?")) return;
    try {
      await api(`/api/segments/${id}`, { method: "DELETE" });
      notify("Segment deleted", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Segments" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text="Build smart audiences for your campaigns" speed={3} /></p>
        </div>
        <Link href="/segments/new" className="btn btn-primary">+ New Segment</Link>
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
            <div className="section-label">Presets</div>
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

            <div className="section-label" style={{ marginTop: 8 }}>Custom segments</div>
            {segments.length === 0 ? (
              <div className="card empty-state">
                <div className="es-icon" aria-hidden>🎯</div>
                <div className="es-title">No custom segments yet</div>
                <div className="es-sub">Create a segment to reuse smart filters across campaigns.</div>
                <Link href="/segments/new" className="btn btn-primary" style={{ marginTop: 12 }}>Create segment</Link>
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
                          <div className="small muted">{s.description || "No description"}</div>
                        </div>
                        <span className="badge blue">{filterCount} filter(s)</span>
                        <button className="btn btn-sm btn-ghost-danger" onClick={(e) => { e.stopPropagation(); del(s.id); }}>Delete</button>
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