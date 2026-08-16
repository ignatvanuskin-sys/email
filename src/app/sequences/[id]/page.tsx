"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
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
      setError(e instanceof Error ? e.message : "Failed to load");
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
      notify("Name updated", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveTrigger = async () => {
    try {
      await api(`/api/sequences/${params.id}`, { method: "PATCH", body: JSON.stringify({ triggerType, isActive }) });
      notify(isActive ? "Journey activated" : "Journey saved", "success");
    } catch (e) { notify(e instanceof Error ? e.message : "Update failed", "error"); }
  };

  const saveAutomation = async () => { try { await api(`/api/sequences/${params.id}/automation`, { method: "PATCH", body: JSON.stringify({ channel, conditionJson: conditionJson || null, goalEventType: goalEventType || null, exitEventType: exitEventType || null }) }); notify("Automation rules saved", "success"); } catch (e) { notify(e instanceof Error ? e.message : "Automation save failed", "error"); } };
  const generateAutomation = async () => { try { const result = await api<{ automation: { conditions: unknown[]; goalEventType: string | null; exitEventType: string | null } }>("/api/ai/automation", { method: "POST", body: JSON.stringify({ description: aiAutomationDescription }) }); setConditionJson(JSON.stringify(result.automation.conditions)); setGoalEventType(result.automation.goalEventType ?? ""); setExitEventType(result.automation.exitEventType ?? ""); notify("Automation rules generated. Review before saving.", "success"); } catch (e) { notify(e instanceof Error ? e.message : "Automation generation failed", "error"); } };

  const addStep = async () => {
    try {
      await api(`/api/sequences/${params.id}/steps`, {
        method: "POST",
        body: JSON.stringify({ delayDays: 1, subject: "New step", body: "" }),
      });
      notify("Step added", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to add step", "error");
    }
  };

  const deleteStep = async (stepId: string) => {
    if (!window.confirm("Delete this step?")) return;
    try {
      await api(`/api/sequences/${params.id}/steps?stepId=${stepId}`, { method: "DELETE" });
      notify("Step deleted", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to delete step", "error");
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
      notify(e instanceof Error ? e.message : "Update failed", "error");
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
      notify("Step updated", "success");
      setEditingStep(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed", "error");
    }
  };

  if (error) return <div className="empty">{error}</div>;
  if (loading || !data) return <div className="empty">Loading sequence...</div>;

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
          <Link href="/sequences" className="btn">Back</Link>
        </div>
      </div>

      <p className="page-sub" style={{ marginTop: -8, marginBottom: 20 }}>
        <ShinyText text={`${data.steps.length} step(s) · Created ${new Date(data.sequence.createdAt).toLocaleDateString()}`} speed={3} />
      </p>

      <SpotlightCard>
        <div className="card" style={{ padding: 18 }}>
          <div className="row" style={{ marginBottom: 18, alignItems: "end" }}>
            <div className="field grow" style={{ margin: 0 }}><label>Event trigger</label><input className="input" value={triggerType} onChange={(e) => setTriggerType(e.target.value)} placeholder="contact.created" /></div>
            <div className="field" style={{ margin: 0 }}><label>Channel</label><select className="select" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="email">Email</option><option value="telegram">Telegram</option></select></div>
            <label className="row small" style={{ paddingBottom: 8 }}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>
            <button className="btn btn-primary" onClick={saveTrigger}>Save trigger</button>
          </div>
          <div className="card" style={{ padding: 12, marginBottom: 16, background: "var(--surface-2)" }}><div className="section-label">Conditions and exits</div><div className="row" style={{ gap: 8 }}><input className="input grow" value={goalEventType} onChange={(e) => setGoalEventType(e.target.value)} placeholder="Goal event, e.g. order.paid" /><input className="input grow" value={exitEventType} onChange={(e) => setExitEventType(e.target.value)} placeholder="Exit event, e.g. unsubscribe" /></div><textarea className="input" rows={3} value={conditionJson} onChange={(e) => setConditionJson(e.target.value)} placeholder='[{"field":"plan","operator":"equals","value":"pro"}]' style={{ marginTop: 8 }} /><div className="row" style={{ gap: 8, marginTop: 8 }}><input className="input grow" value={aiAutomationDescription} onChange={(e) => setAiAutomationDescription(e.target.value)} placeholder="Describe the automation in plain language" /><button className="btn btn-sm" onClick={generateAutomation} disabled={aiAutomationDescription.length < 5}>Generate with AI</button><button className="btn btn-sm btn-primary" onClick={saveAutomation}>Save automation rules</button></div></div>
          <div className="row" style={{ marginBottom: 16 }}>
            <div className="section-label" style={{ margin: 0 }}>Steps</div>
            <button className="btn btn-sm btn-primary" onClick={addStep}>+ Add Step</button>
          </div>

          {data.steps.length === 0 ? (
            <div className="empty">No steps yet. Add your first step.</div>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {data.steps.map((step) => (
                <FadeContent key={step.id}>
                  <div className="card" style={{ padding: 14, borderLeft: `4px solid ${step.enabled ? "var(--accent)" : "var(--border)"}` }}>
                    {editingStep === step.id ? (
                      <div className="stack" style={{ gap: 8 }}>
                        <div className="field">
                          <label>Delay (days)</label>
                          <input className="input" type="number" min={0} value={stepForm.delayDays} onChange={(e) => setStepForm((f) => ({ ...f, delayDays: Number(e.target.value) }))} />
                        </div>
                        <div className="field">
                          <label>Subject</label>
                          <input className="input" value={stepForm.subject} onChange={(e) => setStepForm((f) => ({ ...f, subject: e.target.value }))} />
                        </div>
                        <div className="field">
                          <label>Body</label>
                          <textarea className="input" rows={4} value={stepForm.body} onChange={(e) => setStepForm((f) => ({ ...f, body: e.target.value }))} />
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => saveStep(step.id)}>Save</button>
                          <button className="btn btn-sm" onClick={() => setEditingStep(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="row" style={{ marginBottom: 6 }}>
                          <span style={{ fontWeight: 600 }}>Step {step.position}</span>
                          <span className="grow" />
                          <label className="toggle-label" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                            <input type="checkbox" checked={step.enabled} onChange={(e) => toggleStep(step.id, e.target.checked)} />
                            Enabled
                          </label>
                        </div>
                        <div className="small muted" style={{ marginBottom: 4 }}>Delay: {step.delayDays} day(s)</div>
                        <div className="small" style={{ fontWeight: 500 }}>{step.subject || <span className="muted">No subject</span>}</div>
                        <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {step.body ? (step.body.length > 120 ? step.body.slice(0, 120) + "..." : step.body) : <span className="muted">No body</span>}
                        </div>
                        <div className="row" style={{ marginTop: 8, gap: 8 }}>
                          <button className="btn btn-sm" onClick={() => startEdit(step)}>Edit</button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => deleteStep(step.id)}>Delete</button>
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
