"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { formatDate } from "@/lib/utils";

type Template = { id: string; name: string; category: string; subject: string; body: string; createdAt: string };

const CATEGORIES = [
  { value: "All", label: "Все" },
  { value: "Cold outreach", label: "Первое обращение" },
  { value: "Partnership", label: "Партнёрство" },
  { value: "YouTube", label: "YouTube" },
  { value: "Telegram", label: "Telegram" },
  { value: "Agency", label: "Агентство" },
  { value: "Follow-up", label: "Повторный контакт" },
  { value: "Custom", label: "Другое" },
];

const categoryLabels = Object.fromEntries(CATEGORIES.map((category) => [category.value, category.label]));

export default function TemplatesPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await api<{ templates: Template[] }>("/api/templates");
      setTemplates(response.templates);
    } catch {
      setError("Не удалось загрузить шаблоны. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const filtered = category === "All" ? templates : templates.filter((template) => template.category === category);

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Удалить шаблон «${name}»?`)) return;
    try {
      await api(`/api/templates/${id}`, { method: "DELETE" });
      notify("Шаблон удалён.", "success");
      await load();
    } catch {
      notify("Не удалось удалить шаблон.", "error");
    }
  };

  return (
    <div>
      <div className="page-head"><div><h1 className="page-title">Шаблоны писем</h1><p className="page-sub">Сохраняйте удачные письма и используйте их снова.</p></div><Link href="/templates/new" className="btn btn-primary">＋ Новый шаблон</Link></div>
      {error && <div className="card friendly-error" role="alert">{error}</div>}
      <div className="toolbar template-filters" aria-label="Фильтр шаблонов">{CATEGORIES.map((item) => <button key={item.value} className={`btn btn-sm ${category === item.value ? "btn-primary" : ""}`} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div>
      {loading ? <div className="card" style={{ padding: 24 }}>{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 80, marginBottom: 10 }} />)}</div> : filtered.length === 0 ? <div className="card empty-state"><div className="es-icon" aria-hidden>□</div><div className="es-title">{templates.length === 0 ? "Шаблонов пока нет" : "В этой категории пусто"}</div><div className="es-sub">{templates.length === 0 ? "Создайте первое письмо, чтобы не набирать его заново." : "Выберите другую категорию или создайте новый шаблон."}</div><Link href="/templates/new" className="btn btn-primary">Создать шаблон</Link></div> : <div className="stack" style={{ gap: 12 }}>{filtered.map((template) => <article key={template.id} className="card template-card"><div className="row template-card-head"><div className="grow"><strong>{template.name}</strong><span className="badge" style={{ marginLeft: 8 }}>{categoryLabels[template.category] ?? template.category}</span></div><span className="small muted">{formatDate(template.createdAt)}</span></div><div className="small template-subject">{template.subject}</div><div className="small muted template-preview">{template.body.length > 120 ? `${template.body.slice(0, 120)}…` : template.body}</div><div className="row template-card-actions"><button className="btn btn-sm btn-primary" onClick={() => router.push(`/templates/${template.id}`)}>Открыть</button><button className="btn btn-sm btn-outline-danger" onClick={() => void remove(template.id, template.name)}>Удалить</button></div></article>)}</div>}
    </div>
  );
}
