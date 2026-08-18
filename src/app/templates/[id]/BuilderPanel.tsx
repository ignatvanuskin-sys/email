"use client";

import type { EmailBlock, EmailDocument } from "@/lib/emailBuilder";

export function BuilderPanel({ document, selectedBlock, onSelect, onChange }: { document: EmailDocument; selectedBlock: string | null; onSelect: (id: string | null) => void; onChange: (document: EmailDocument) => void }) {
  const add = (type: EmailBlock["type"]) => {
    const id = `${type}-${Date.now()}`;
    const block: EmailBlock = type === "text" ? { id, type, text: "Новый абзац" } : type === "heading" ? { id, type, text: "Заголовок", level: 2 } : type === "button" ? { id, type, text: "Призыв к действию", url: "https://example.com" } : type === "image" ? { id, type, url: "https://placehold.co/600x240", alt: "Изображение" } : { id, type };
    onChange({ ...document, blocks: [...document.blocks, block] }); onSelect(id);
  };
  const update = (patch: Partial<EmailBlock>) => onChange({ ...document, blocks: document.blocks.map((block) => block.id === selectedBlock ? { ...block, ...patch } as EmailBlock : block) });
  const current = document.blocks.find((block) => block.id === selectedBlock);
  const content = current && current.type !== "divider" ? (current.type === "image" ? current.alt ?? "" : current.text) : "";
  return <div className="stack" style={{ gap: 10, marginTop: 12 }}><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{(["text", "heading", "button", "image", "divider"] as const).map((type) => <button type="button" className="btn btn-sm" key={type} onClick={() => add(type)}>+ {type}</button>)}</div><div className="stack" style={{ gap: 6 }}>{document.blocks.map((block) => <button type="button" className="row small" key={block.id} onClick={() => onSelect(block.id)} style={{ textAlign: "left", padding: 8, border: "1px solid var(--border)", background: block.id === selectedBlock ? "var(--accent-muted)" : "transparent" }}><span className="grow">{block.type}</span><span className="muted">{block.id}</span></button>)}</div>{current && current.type !== "divider" && <div className="stack" style={{ gap: 6 }}><label className="small">Содержимое выбранного блока</label><textarea className="input" rows={3} value={content} onChange={(event) => current.type === "image" ? update({ alt: event.target.value }) : update({ text: event.target.value })} />{current.type === "button" && <><label className="small">URL кнопки</label><input className="input" value={current.url} onChange={(event) => update({ url: event.target.value })} /></>}{current.type === "image" && <><label className="small">URL изображения</label><input className="input" value={current.url} onChange={(event) => update({ url: event.target.value })} /></>}</div>}</div>;
}
