"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Action = {
  id: string;
  label: string;
  group: string;
  icon: string;
  kbd?: string;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  paused,
  onTogglePause,
}: {
  open: boolean;
  onClose: () => void;
  paused: boolean;
  onTogglePause: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = (path: string) => {
    router.push(path);
    onClose();
  };

  const actions: Action[] = useMemo(
    () => [
      { id: "leads", label: "Search leads", group: "Leads", icon: "🔍", kbd: "G L", run: () => go("/leads") },
      { id: "add", label: "Add lead", group: "Leads", icon: "+", kbd: "C", run: () => go("/leads/new") },
      { id: "import", label: "Import leads", group: "Leads", icon: "⇪", kbd: "I", run: () => go("/leads/import") },
      { id: "campaigns", label: "Search campaigns", group: "Campaigns", icon: "📣", run: () => go("/campaigns") },
      { id: "create-campaign", label: "Create campaign", group: "Campaigns", icon: "+", kbd: "G C", run: () => go("/campaigns/new") },
      { id: "sequences", label: "Email sequences", group: "Campaigns", icon: "⇉", run: () => go("/sequences") },
      { id: "templates", label: "Email templates", group: "Campaigns", icon: "📝", run: () => go("/templates") },
      { id: "create-template", label: "Create template", group: "Campaigns", icon: "+", run: () => go("/templates/new") },
      { id: "segments", label: "Segments", group: "Campaigns", icon: "🎯", run: () => go("/segments") },
      { id: "create-segment", label: "Create segment", group: "Campaigns", icon: "+", run: () => go("/segments/new") },
      { id: "generate", label: "Generate email", group: "Email", icon: "✉", run: () => go("/leads") },
      { id: "settings", label: "Open settings", group: "Workspace", icon: "⚙", kbd: "G S", run: () => go("/settings") },
      { id: "followups", label: "Follow-ups", group: "Workspace", icon: "⏰", run: () => go("/follow-ups") },
      { id: "pause", label: paused ? "Resume outreach" : "Pause outreach", group: "Safety", icon: paused ? "▶" : "⏹", run: () => { onTogglePause(); onClose(); } },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paused],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
  }, [query, actions]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(filtered.length - 1, i + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
      if (e.key === "Enter" && filtered[index]) { filtered[index].run(); }
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, index, onClose]);

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-row">
          <span aria-hidden style={{ color: "var(--text-faint)" }}>🔍</span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            aria-label="Search commands"
          />
          <span className="kbd">esc</span>
        </div>
        <div className="cmd-list">
          {filtered.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>No matching commands.</div>
          ) : (
            filtered.map((a, i) => (
              <div
                key={a.id}
                className={`cmd-item ${i === index ? "highlight" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onClick={a.run}
                role="option"
                aria-selected={i === index}
                tabIndex={-1}
              >
                <span className="cmd-icon" aria-hidden>{a.icon}</span>
                <span>{a.label}</span>
                {a.kbd && <span className="kbd cmd-kbd">{a.kbd}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
