"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";

const VARIABLES = ["{{firstName}}", "{{company}}", "{{website}}", "{{channel}}", "{{telegram}}"];
const CATEGORIES = [{ value: "Cold outreach", label: "Первое обращение" }, { value: "Partnership", label: "Партнёрство" }, { value: "YouTube", label: "YouTube" }, { value: "Telegram", label: "Telegram" }, { value: "Agency", label: "Агентство" }, { value: "Follow-up", label: "Повторный контакт" }, { value: "Custom", label: "Другое" }];

export default function NewTemplatePage() {
  const router = useRouter();
  const { notify } = useToast();
  const [form, setForm] = useState({ name: "", category: "Cold outreach", subject: "", body: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const insertVar = (value: string) => setForm((current) => ({ ...current, body: `${current.body}${value}` }));

  const generateWithAI = async () => {
    setAiLoading(true);
    try {
      const leads = await api<{ leads: Array<{ id: string }> }>("/api/leads");
      const leadId = leads.leads[0]?.id;
      if (!leadId) { notify("Добавьте хотя бы один контакт для генерации письма.", "error"); return; }
      const response = await api<{ email: { subject: string; body: string } }>("/api/emails/generate", { method: "POST", body: JSON.stringify({ leadId }) });
      setForm((current) => ({ ...current, subject: response.email.subject, body: response.email.body }));
      notify("Текст письма подготовлен. Проверьте его перед сохранением.", "success");
    } catch {
      notify("Не удалось подготовить текст письма.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/templates", { method: "POST", body: JSON.stringify(form) });
      notify("Шаблон сохранён.", "success");
      router.push("/templates");
    } catch {
      setError("Не удалось сохранить шаблон. Проверьте заполненные поля.");
    } finally {
      setLoading(false);
    }
  };

  return <div>
    <div className="page-head"><div><h1 className="page-title">Новый шаблон</h1><p className="page-sub">Сохраните письмо, чтобы использовать его в будущих рассылках.</p></div><Link href="/templates" className="btn">← К шаблонам</Link></div>
    <form className="card form-card template-form" onSubmit={submit}>
      <div className="field"><label htmlFor="template-name">Название шаблона *</label><input id="template-name" className="input" value={form.name} onChange={set("name")} required placeholder="Например, знакомство о сотрудничестве" /></div>
      <div className="field"><label htmlFor="template-category">Категория</label><select id="template-category" className="select" value={form.category} onChange={set("category")}>{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></div>
      <div className="field"><label htmlFor="template-subject">Тема письма *</label><input id="template-subject" className="input" value={form.subject} onChange={set("subject")} required placeholder="Предложение о сотрудничестве с {{company}}" /></div>
      <div className="field"><label htmlFor="template-body">Текст письма *</label><textarea id="template-body" className="input" rows={10} value={form.body} onChange={set("body")} required placeholder="Здравствуйте, {{firstName}}!" /></div>
      <div className="field"><label>Переменные</label><p className="field-hint">Нажмите на переменную, чтобы вставить её в письмо.</p><div className="row variable-list">{VARIABLES.map((variable) => <button type="button" key={variable} className="badge variable-button" onClick={() => insertVar(variable)}>{variable}</button>)}</div></div>
      <details className="form-extra"><summary>Помочь с текстом с помощью ИИ</summary><div className="form-extra-content"><p className="small muted">ИИ возьмёт первый контакт из списка как пример. Результат нужно проверить и отредактировать вручную.</p><button type="button" className="btn" disabled={aiLoading} onClick={() => void generateWithAI()}>{aiLoading ? <><span className="spinner" /> Готовим…</> : "Подготовить черновик"}</button></div></details>
      {error && <div className="friendly-error" role="alert">{error}</div>}
      <div className="form-actions"><Link href="/templates" className="btn">Отмена</Link><button className="btn btn-primary btn-lg" disabled={loading}>{loading ? "Сохраняем…" : "Сохранить шаблон"}</button></div>
    </form>
  </div>;
}
