"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { formatDate } from "@/lib/utils";
import ShinyText from "@/components/react-bits/ShinyText";
import SpotlightCard from "@/components/react-bits/SpotlightCard";
import FadeContent from "@/components/react-bits/FadeContent";
import { JourneyCanvas } from "./JourneyCanvas";

type Step = {
  id: string;
  position: number;
  delayDays: number;
  subject: string;
  body: string;
  enabled: boolean;
};

type SequenceData = {
  sequence: {
    id: string;
    name: string;
    createdAt: string;
    triggerType?: string;
    isActive?: boolean;
    channel?: string;
    conditionJson?: string | null;
    goalEventType?: string | null;
    exitEventType?: string | null;
  };
  steps: Step[];
};

export default function SequenceDetailPage() {
  const params = useParams<{ id: string }>();
  const { notify } = useToast();
  const [data, setData] = useState<SequenceData | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [stepForm, setStepForm] = useState({ delayDays: 1, subject: "", body: "" });
  const [triggerType, setTriggerType] = useState("Manual");
  const [isActive, setIsActive] = useState(false);
  const [channel, setChannel] = useState("email");
  const [conditionJson, setConditionJson] = useState("");
  const [goalEventType, setGoalEventType] = useState("");
  const [exitEventType, setExitEventType] = useState("");
  const [aiAutomationDescription, setAiAutomationDescription] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<SequenceData>(`/api/sequences/${params.id}`);
      setData(d);
      setName(d.sequence.name);
      setTriggerType(d.sequence.triggerType ?? "Manual");
      setIsActive(Boolean(d.sequence.isActive));
      setChannel(d.sequence.channel ?? "email");
      setConditionJson(d.sequence.conditionJson ?? "");
      setGoalEventType(d.sequence.goalEventType ?? "");
      setExitEventType(d.sequence.exitEventType ?? "");
      setError("");
    } catch (e) {
      setError("Не удалось загрузить автоматическую цепочку. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const saveName = async () => {
    setSaving(true);
    try {
      await api(`/api/sequences/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      notify("Название обновлено.", "success");
    } catch (e) {
      notify("Не удалось сохранить изменения.", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveTrigger = async () => {
    try {
      await api(`/api/sequences/${params.id}`, { method: "PATCH", body: JSON.stringify({ triggerType, isActive }) });
      notify(isActive ? "Цепочка активирована." : "Цепочка сохранена.", "success");
    } catch (e) { notify("Не удалось сохранить настройки запуска.", "error"); }
  };

  const saveAutomation = async () => { try { await api(`/api/sequences/${params.id}/automation`, { method: "PATCH", body: JSON.stringify({ channel, conditionJson: conditionJson || null, goalEventType: goalEventType || null, exitEventType: exitEventType || null }) }); notify("Правила автоматизации сохранены.", "success"); } catch (e) { notify("Не удалось сохранить правила автоматизации.", "error"); } };
  const generateAutomation = async () => { try { const result = await api<{ automation: { conditions: unknown[]; goalEventType: string | null; exitEventType: string | null } }>("/api/ai/automation", { method: "POST", body: JSON.stringify({ description: aiAutomationDescription }) }); setConditionJson(JSON.stringify(result.automation.conditions)); setGoalEventType(result.automation.goalEventType ?? ""); setExitEventType(result.automation.exitEventType ?? ""); notify("Правила автоматизации созданы. Проверьте их перед сохранением.", "success"); } catch (e) { notify("Не удалось создать правила автоматизации.", "error"); } };

  const addStep = async () => {
    try {
      await api(`/api/sequences/${params.id}/steps`, {
        method: "POST",
        body: JSON.stringify({ delayDays: 1, subject: "Новый шаг", body: "" }),
      });
      notify("Шаг добавлен.", "success");
      await load();
    } catch (e) {
      notify("Не удалось добавить шаг.", "error");
    }
  };

  const deleteStep = async (stepId: string) => {
    if (!window.confirm("Удалить этот шаг?")) return;
    try {
      await api(`/api/sequences/${params.id}/steps?stepId=${stepId}`, { method: "DELETE" });
      notify("Шаг удалён.", "success");
      await load();
    } catch (e) {
      notify("Не удалось удалить шаг.", "error");
    }
  };

  const toggleStep = async (stepId: string, enabled: boolean) => {
    try {
      await api(`/api/sequences/${params.id}/steps`, {
        method: "PATCH",
        body: JSON.stringify({ stepId, enabled }),
      });
      await load();
    } catch (e) {
      notify("Не удалось сохранить изменения.", "error");
    }
  };

  const startEdit = (step: Step) => {
    setEditingStep(step.id);
    setStepForm({ delayDays: step.delayDays, subject: step.subject, body: step.body });
  };

  const saveStep = async (stepId: string) => {
    try {
      await api(`/api/sequences/${params.id}/steps`, {
        method: "PATCH",
        body: JSON.stringify({ stepId, ...stepForm }),
      });
      notify("Шаг обновлён.", "success");
      setEditingStep(null);
      await load();
    } catch (e) {
      notify("Не удалось сохранить изменения.", "error");
    }
  };

  if (error) return <div className="empty">{error}</div>;
  if (loading || !data) return <div className="empty">Загрузка цепочки…</div>;

  return (
    <div>
      <div className="page-head">
        <div className="row" style={{ gap: 12 }}>
          <input
            className="input"
            style={{ fontSize: 20, fontWeight: 650, maxWidth: 400 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
          />
          {saving && <span className="spinner" />}
        </div>
        <div className="row">
          <Link href="/sequences" className="btn">Назад</Link>
        </div>
      </div>

      <p className="page-sub" style={{ marginTop: -8, marginBottom: 20 }}>
        <ShinyText text={`${data.steps.length} шагов · Создана: ${formatDate(data.sequence.createdAt)}`} speed={3} />
      </p>

      <SpotlightCard>
        <div className="card" style={{ padding: 18 }}>
          <div className="row" style={{ marginBottom: 18, alignItems: "end" }}>
            <div className="field grow" style={{ margin: 0 }}><label>Событие запуска</label><input className="input" value={triggerType} onChange={(e) => setTriggerType(e.target.value)} placeholder="contact.created" /></div>
            <div className="field" style={{ margin: 0 }}><label>Канал</label><select className="select" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="email">Почта</option><option value="telegram">Telegram</option></select></div>
            <label className="row small" style={{ paddingBottom: 8 }}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Активна</label>
            <button className="btn btn-primary" onClick={saveTrigger}>Сохранить запуск</button>
          </div>
          <div className="card" style={{ padding: 12, marginBottom: 16, background: "var(--surface-2)" }}><div className="section-label">Условия и выход</div><div className="row" style={{ gap: 8 }}><input className="input grow" value={goalEventType} onChange={(e) => setGoalEventType(e.target.value)} placeholder="Событие цели, например order.paid" /><input className="input grow" value={exitEventType} onChange={(e) => setExitEventType(e.target.value)} placeholder="Событие выхода, например unsubscribe" /></div><textarea className="input" rows={3} value={conditionJson} onChange={(e) => setConditionJson(e.target.value)} placeholder='[{"field":"plan","operator":"equals","value":"pro"}]' style={{ marginTop: 8 }} /><div className="row" style={{ gap: 8, marginTop: 8 }}><input className="input grow" value={aiAutomationDescription} onChange={(e) => setAiAutomationDescription(e.target.value)} placeholder="Опишите автоматизацию обычными словами" /><button className="btn btn-sm" onClick={generateAutomation} disabled={aiAutomationDescription.length < 5}>Создать с помощью ИИ</button><button className="btn btn-sm btn-primary" onClick={saveAutomation}>Сохранить правила</button></div></div>
          <div className="row" style={{ marginBottom: 16 }}>
            <div className="section-label" style={{ margin: 0 }}>Шаги</div>
            <button className="btn btn-sm btn-primary" onClick={addStep}>＋ Добавить шаг</button>
          </div>

          {data.steps.length === 0 ? (
            <div className="empty">Шагов пока нет. Добавьте первый шаг.</div>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {data.steps.map((step) => (
                <FadeContent key={step.id}>
                  <div className="card" style={{ padding: 14, borderLeft: `4px solid ${step.enabled ? "var(--accent)" : "var(--border)"}` }}>
                    {editingStep === step.id ? (
                      <div className="stack" style={{ gap: 8 }}>
                        <div className="field">
                          <label>Задержка (дни)</label>
                          <input className="input" type="number" min={0} value={stepForm.delayDays} onChange={(e) => setStepForm((f) => ({ ...f, delayDays: Number(e.target.value) }))} />
                        </div>
                        <div className="field">
                          <label>Тема письма</label>
                          <input className="input" value={stepForm.subject} onChange={(e) => setStepForm((f) => ({ ...f, subject: e.target.value }))} />
                        </div>
                        <div className="field">
                          <label>Текст письма</label>
                          <textarea className="input" rows={4} value={stepForm.body} onChange={(e) => setStepForm((f) => ({ ...f, body: e.target.value }))} />
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => saveStep(step.id)}>Сохранить</button>
                          <button className="btn btn-sm" onClick={() => setEditingStep(null)}>Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="row" style={{ marginBottom: 6 }}>
                          <span style={{ fontWeight: 600 }}>Шаг {step.position}</span>
                          <span className="grow" />
                          <label className="toggle-label" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                            <input type="checkbox" checked={step.enabled} onChange={(e) => toggleStep(step.id, e.target.checked)} />
                            Активен
                          </label>
                        </div>
                        <div className="small muted" style={{ marginBottom: 4 }}>Задержка: {step.delayDays} дн.</div>
                        <div className="small" style={{ fontWeight: 500 }}>{step.subject || <span className="muted">Тема не указана</span>}</div>
                        <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {step.body ? (step.body.length > 120 ? step.body.slice(0, 120) + "..." : step.body) : <span className="muted">Текст не указан</span>}
                        </div>
                        <div className="row" style={{ marginTop: 8, gap: 8 }}>
                          <button className="btn btn-sm" onClick={() => startEdit(step)}>Изменить</button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => deleteStep(step.id)}>Удалить</button>
                        </div>
                      </>
                    )}
                  </div>
                </FadeContent>
              ))}
            </div>
          )}
        </div>
      </SpotlightCard>
      <JourneyCanvas sequenceId={params.id} />
    </div>
  );
}
