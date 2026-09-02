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
  const [preset, setPreset] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ sequence: { id: string } }>("/api/sequences", {
        method: "POST",
        body: JSON.stringify({ name, ...(preset ? { preset } : {}) }),
      });
      router.push(`/sequences/${res.sequence.id}`);
    } catch (err) {
      setError("Не удалось создать автоматическую цепочку. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Новая цепочка</h1>
          <p className="page-sub">Создайте цепочку писем в несколько шагов.</p>
        </div>
        <Link href="/sequences" className="btn">Назад к цепочкам</Link>
      </div>

      <form className="card" style={{ maxWidth: 560, padding: 24 }} onSubmit={submit}>
        <div className="field">
          <label>Название *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Например, повторный контакт после первого письма" />
        </div>
        <div className="field">
          <label>Начать с готового варианта</label>
          <select className="select" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">Пустая цепочка</option>
            <option value="Welcome">Приветственная</option>
            <option value="AbandonedCart">Брошенная корзина</option>
            <option value="Reactivation">Возобновление контакта</option>
          </select>
          <div className="small muted">Готовый вариант сам добавит событие запуска и первые шаги.</div>
        </div>

        {error && <div className="small" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Создание…" : "Создать цепочку"}
        </button>
      </form>
    </div>
  );
}
