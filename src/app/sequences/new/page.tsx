"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function NewSequencePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ sequence: { id: string } }>("/api/sequences", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      router.push(`/sequences/${res.sequence.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">New sequence</h1>
          <p className="page-sub">Create a multi-step email sequence.</p>
        </div>
        <Link href="/sequences" className="btn">Back to sequences</Link>
      </div>

      <form className="card" style={{ maxWidth: 560, padding: 24 }} onSubmit={submit}>
        <div className="field">
          <label>Name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Welcome sequence" />
        </div>

        {error && <div className="small" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Creating..." : "Create sequence"}
        </button>
      </form>
    </div>
  );
}