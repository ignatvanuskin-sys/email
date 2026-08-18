"use client";

import { useState, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { api } from "@/lib/client";
import ShinyText from "@/components/react-bits/ShinyText";
import ClickSpark from "@/components/react-bits/ClickSpark";

export type EmailDraft = { id: string; subject: string; body: string };

const AI_ACTIONS: Array<{ key: string; label: string; icon: string }> = [
  { key: "improve", label: "Улучшить", icon: "✦" },
  { key: "shorten", label: "Сократить", icon: "⤢" },
  { key: "casual", label: "Сделать проще", icon: "🙂" },
  { key: "professional", label: "Сделать профессиональнее", icon: "💼" },
  { key: "regenerate", label: "Создать заново", icon: "↻" },
];

export function EmailCard({
  draft,
  busy,
  onGenerate,
  onDraftChange,
  onSent,
}: {
  draft: EmailDraft | null;
  busy: string;
  onGenerate: () => void;
  onDraftChange: (d: EmailDraft) => void;
  onSent?: () => void;
}) {
  const [approved, setApproved] = useState(false);
  const [localBusy, setLocalBusy] = useState("");
  const [error, setError] = useState("");
  const [rewriteLabel, setRewriteLabel] = useState("");

  const run = async (label: string, fn: () => Promise<void>) => {
    setLocalBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setLocalBusy("");
      setRewriteLabel("");
    }
  };

  const edit = (action: string) => {
    setRewriteLabel(AI_ACTIONS.find((a) => a.key === action)?.label ?? "Переписывание");
    run(action, async () => {
      if (!draft) return;
      const res = await api<{ email: EmailDraft }>("/api/emails/edit", {
        method: "POST", body: JSON.stringify({ emailId: draft.id, action }),
      });
      onDraftChange(res.email);
      setApproved(false);
      setDraftKey((k) => k + 1);
    });
  };

  const approve = () => run("approve", async () => {
    if (!draft) return;
    await api("/api/emails/approve", {
      method: "POST", body: JSON.stringify({ emailId: draft.id, subject: draft.subject, body: draft.body }),
    });
    setApproved(true);
  });

  const send = () => run("send", async () => {
    if (!draft) return;
    await api("/api/emails/send", { method: "POST", body: JSON.stringify({ emailId: draft.id }) });
    onDraftChange({ id: draft.id, subject: "", body: "" });
    setApproved(false);
    onSent?.();
  });

  const editing = localBusy === "approve" || localBusy === "send" || !!busy;
  const contentRef = useRef<HTMLDivElement>(null);
  const prevDraftKey = useRef<number>(0);
  const [draftKey, setDraftKey] = useState(0);

  useEffect(() => {
    if (draft?.id) {
      setDraftKey((k) => k + 1);
    }
  }, [draft?.id]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const changed = prevDraftKey.current !== draftKey;
    prevDraftKey.current = draftKey;
    if (prefersReducedMotion) {
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }
    if (changed) {
      gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", overwrite: true });
    }
    return () => {
      gsap.killTweensOf(el);
    };
  }, [draftKey]);

  return (
    <section className="card" style={{ padding: 20 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="section-label" style={{ marginBottom: 0 }}>
          <ShinyText text="Генератор писем" speed={2.5} shineColor="#ffffff" color="#888" />
        </div>
        {approved && <span className="badge green">Одобрено</span>}
      </div>

      {error && <div className="small" style={{ color: "var(--red)", marginBottom: 10 }}>{error}</div>}

      {!draft || !draft.body ? (
        <ClickSpark sparkColor="rgba(255,255,255,0.7)" sparkSize={7} sparkRadius={18} sparkCount={10}>
          <button className="btn btn-primary btn-lg btn-block" onClick={onGenerate} disabled={!!busy}>
            {busy === "generating" ? <><span className="spinner" /> Создание…</> : "Создать письмо"}
          </button>
        </ClickSpark>
      ) : (
        <div ref={contentRef} className="stack" style={{ gap: 12 }}>
          {localBusy && AI_ACTIONS.some((a) => a.key === localBusy) && (
            <div className="card" style={{ padding: 12, background: "var(--accent-soft)", borderColor: "var(--accent)", display: "flex", alignItems: "center", gap: 10 }}>
              <span className="spinner" aria-hidden />
              <span style={{ fontWeight: 600 }}>AI is rewriting…</span>
              <span className="small muted">({rewriteLabel})</span>
            </div>
          )}
          <div className="field">
            <label>Subject</label>
            <input className="input" value={draft.subject} onChange={(e) => { onDraftChange({ ...draft, subject: e.target.value }); if (approved) setApproved(false); }} />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea className="input" rows={10} value={draft.body} onChange={(e) => { onDraftChange({ ...draft, body: e.target.value }); if (approved) setApproved(false); }} />
          </div>

          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {AI_ACTIONS.map((a) => (
              <button key={a.key} className="btn btn-sm" onClick={() => edit(a.key)} disabled={editing}>
                {localBusy === a.key ? <span className="spinner" /> : <><span aria-hidden>{a.icon}</span> {a.label}</>}
              </button>
            ))}
          </div>

          <div className="divider" style={{ margin: "4px 0" }} />

          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-success btn-lg" onClick={approve} disabled={editing} style={{ flex: 1 }}>
              {localBusy === "approve" ? "Одобрение…" : approved ? "✓ Одобрено — готово к отправке" : "✓ Одобрить"}
            </button>
{approved && (
              <div style={{ flex: 1, minWidth: 140 }}>
                <ClickSpark sparkColor="rgba(255,255,255,0.8)" sparkSize={8} sparkRadius={20} sparkCount={12}>
                  <button className="btn btn-primary btn-lg" onClick={send} disabled={editing} style={{ width: "100%" }}>
                    {localBusy === "send" ? <><span className="spinner" /> Отправка...</> : "Отправить"}
                  </button>
                </ClickSpark>
              </div>
            )}
          </div>
          {approved && (
            <p className="small muted">Письмо одобрено. После отправки лид получит статус <strong>Связались</strong>, а повторный контакт будет запланирован автоматически.</p>
          )}
        </div>
      )}
    </section>
  );
}
