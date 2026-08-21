"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";

type Option = { id: string; name: string };
type FormState = { name: string; description: string; dailyLimit: number; templateId: string; sequenceId: string; segmentId: string };

export default function NewCampaignPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [form, setForm] = useState<FormState>({ name: "", description: "", dailyLimit: 25, templateId: "", sequenceId: "", segmentId: "" });
  const [templates, setTemplates] = useState<Option[]>([]);
  const [sequences, setSequences] = useState<Option[]>([]);
  const [segments, setSegments] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState("");
  const [aiGoal, setAiGoal] = useState("");
  const [aiTone, setAiTone] = useState("Дружелюбный и краткий");
  const [aiLoading, setAiLoading] = useState(false);
  const [subjects, setSubjects] = useState<Array<{ text: string; angle: string }>>([]);
  const [draft, setDraft] = useState({ subject: "", preheader: "", body: "" });

  const loadOptions = useCallback(async () => {
    try {
      const [templatesResponse, sequencesResponse, segmentsResponse] = await Promise.all([api<{ templates: Option[] }>("/api/templates"), api<{ sequences: Option[] }>("/api/sequences"), api<{ segments: Option[] }>("/api/segments")]);
      setTemplates(templatesResponse.templates);
      setSequences(sequencesResponse.sequences);
      setSegments(segmentsResponse.segments);
    } catch {
      notify("Не удалось загрузить варианты. Попробуйте обновить страницу.", "error");
    } finally {
      setLoadingOptions(false);
    }
  }, [notify]);

  useEffect(() => { void loadOptions(); }, [loadOptions]);

  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: key === "dailyLimit" ? Number(event.target.value) : event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await api<{ campaign: { id: string } }>("/api/campaigns", { method: "POST", body: JSON.stringify({ name: form.name, description: form.description, dailyLimit: form.dailyLimit, templateId: form.templateId || null, sequenceId: form.sequenceId || null, segmentId: form.segmentId || null }) });
      notify("Рассылка создана.", "success");
      router.push(`/campaigns/${response.campaign.id}`);
    } catch {
      setError("Не удалось создать рассылку. Проверьте данные и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const generateDraft = async () => {
    setAiLoading(true);
    try {
      const result = await api<{ draft: { subject: string; body: string; preheader: string } }>("/api/ai/campaign-draft", { method: "POST", body: JSON.stringify({ goal: aiGoal, tone: aiTone, audience: form.description, offer: form.description }) });
      setDraft(result.draft);
      notify("Черновик готов. Проверьте его перед использованием.", "success");
    } catch {
      notify("Не удалось подготовить черновик.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const generateSubjects = async () => {
    setAiLoading(true);
    try {
      const result = await api<{ subjects: Array<{ text: string; angle: string }> }>("/api/ai/subjects", { method: "POST", body: JSON.stringify({ goal: aiGoal, tone: aiTone, audience: form.description, offer: form.description }) });
      setSubjects(result.subjects);
    } catch {
      notify("Не удалось подготовить варианты темы.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <div className="page-head"><div><h1 className="page-title">Новая рассылка</h1><p className="page-sub">Сначала подготовим кампанию. Отправка начнётся только после вашей проверки.</p></div><Link href="/campaigns" className="btn">← К рассылкам</Link></div>
      <form className="card campaign-form" onSubmit={submit}>
        <div className="field"><label htmlFor="campaign-name">Название рассылки *</label><input id="campaign-name" className="input" value={form.name} onChange={set("name")} required placeholder="Например, знакомство с компаниями" /></div>
        <div className="field"><label htmlFor="campaign-goal">Цель рассылки</label><textarea id="campaign-goal" className="input" rows={3} value={form.description} onChange={set("description")} placeholder="Какой результат вы хотите получить?" /></div>
        <div className="field"><label htmlFor="campaign-template">Шаблон письма</label><select id="campaign-template" className="select" value={form.templateId} onChange={set("templateId")} disabled={loadingOptions}><option value="">Выберите шаблон позже</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><span className="field-hint">Шаблон можно выбрать сейчас или добавить в карточке рассылки.</span></div>
        <div className="field"><label htmlFor="campaign-segment">Кому отправлять</label><select id="campaign-segment" className="select" value={form.segmentId} onChange={set("segmentId")} disabled={loadingOptions}><option value="">Все контакты</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></div>

        <details className="form-extra">
          <summary>Дополнительные настройки</summary>
          <div className="form-extra-content">
            <div className="field"><label htmlFor="campaign-limit">Лимит писем в день</label><input id="campaign-limit" className="input" type="number" min={1} value={form.dailyLimit} onChange={set("dailyLimit")} /><span className="field-hint">Начните с небольшого лимита, чтобы проверить доставляемость.</span></div>
            <div className="field"><label htmlFor="campaign-sequence">Автоматическая цепочка</label><select id="campaign-sequence" className="select" value={form.sequenceId} onChange={set("sequenceId")} disabled={loadingOptions}><option value="">Без цепочки</option>{sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></div>
          </div>
        </details>

        <details className="form-extra">
          <summary>Помощник ИИ</summary>
          <div className="form-extra-content">
            <p className="small muted">Опишите задачу — помощник подготовит черновик. Он не отправляет письма автоматически.</p>
            <div className="field"><label htmlFor="ai-goal">Что нужно предложить</label><textarea id="ai-goal" className="input" rows={2} value={aiGoal} onChange={(event) => setAiGoal(event.target.value)} placeholder="Предложить сотрудничество активным клиентам" /></div>
            <div className="field"><label htmlFor="ai-tone">Тон письма</label><input id="ai-tone" className="input" value={aiTone} onChange={(event) => setAiTone(event.target.value)} /></div>
            <div className="row ai-actions"><button type="button" className="btn" onClick={() => void generateDraft()} disabled={aiLoading || aiGoal.length < 3}>{aiLoading ? "Готовим…" : "Подготовить черновик"}</button><button type="button" className="btn" onClick={() => void generateSubjects()} disabled={aiLoading || aiGoal.length < 3}>Предложить темы</button></div>
            {subjects.length > 0 && <div className="stack ai-results">{subjects.map((subject) => <button type="button" className="btn ai-subject" key={subject.text} onClick={() => setForm((current) => ({ ...current, description: `${current.description}\nТема: ${subject.text}` }))}><strong>{subject.text}</strong><span className="small muted"> · {subject.angle}</span></button>)}</div>}
            {draft.body && <div className="stack ai-results"><div className="field"><label>Тема</label><input className="input" value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} /></div><div className="field"><label>Прехедер</label><input className="input" value={draft.preheader} onChange={(event) => setDraft((current) => ({ ...current, preheader: event.target.value }))} /></div><div className="field"><label>Текст письма</label><textarea className="input" rows={6} value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></div></div>}
          </div>
        </details>

        {error && <div className="friendly-error" role="alert">{error}</div>}
        <div className="form-actions"><Link href="/campaigns" className="btn">Отмена</Link><button className="btn btn-primary btn-lg" disabled={loading || loadingOptions}>{loading ? "Создаём…" : "Создать рассылку"}</button></div>
      </form>
    </div>
  );
}
