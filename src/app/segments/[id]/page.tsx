"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
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
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api(`/api/segments/${params.id}`, { method: "PATCH", body: JSON.stringify({ name, description }) });
      notify("Segment updated", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed", "error");
    }
  };

  const del = async () => {
    if (!window.confirm("Delete this segment?")) return;
    try {
      await api(`/api/segments/${params.id}`, { method: "DELETE" });
      notify("Segment deleted", "success");
      router.push("/segments");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  if (loading) return <div className="card" style={{ padding: 24 }}><div className="skeleton" style={{ height: 40 }} /></div>;
  if (error) return <div className="empty">{error}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text={name || "Segment"} className="page-title" delay={40} animateBy="words" />
          <p className="page-sub">{description || "Custom segment"}</p>
        </div>
        <div className="row">
          <Link href="/segments" className="btn btn-ghost">← Back</Link>
          <button className="btn btn-outline-danger" onClick={del}>Delete</button>
        </div>
      </div>

      <FadeContent>
        <div className="card" style={{ maxWidth: 620, padding: 20, marginBottom: 20 }}>
          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={save}>Save changes</button>
        </div>
      </FadeContent>

      <div className="section-label">Matching leads · {leads.length}</div>
      <div className="card" style={{ overflow: "hidden" }}>
        {leads.length === 0 ? (
          <div className="empty-state">
            <div className="es-title">No leads match this segment</div>
            <div className="es-sub">Adjust your filters to widen the audience.</div>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 400 }}>
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Score</th><th>Status</th></tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td data-label="Name"><Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.name}</Link></td>
                    <td data-label="Email">{l.email || <span className="muted">—</span>}</td>
                    <td data-label="Score"><span className={`badge ${l.leadScore >= 80 ? "hot" : l.leadScore >= 50 ? "warm" : "cold"}`}>{l.leadScore}</span></td>
                    <td data-label="Status">{l.status}</td>
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