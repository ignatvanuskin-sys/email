"use client";

import type { EmailBlock, EmailDocument } from "@/lib/emailBuilder";

const BLOCKS: Array<{ type: EmailBlock["type"]; label: string }> = [
  { type: "text", label: "Текст" },
  { type: "heading", label: "Заголовок" },
  { type: "button", label: "Кнопка" },
  { type: "image", label: "Изображение" },
  { type: "divider", label: "Разделитель" },
];

export function BuilderPanel({ document, selectedBlock, onSelect, onChange }: { document: EmailDocument; selectedBlock: string | null; onSelect: (id: string | null) => void; onChange: (document: EmailDocument) => void }) {
  const add = (type: EmailBlock["type"]) => {
    const id = `${type}-${Date.now()}`;
    const block: EmailBlock = type === "text" ? { id, type, text: "Новый абзац" } : type === "heading" ? { id, type, text: "Заголовок", level: 2 } : type === "button" ? { id, type, text: "Призыв к действию", url: "https://example.com" } : type === "image" ? { id, type, url: "https://placehold.co/600x240", alt: "Изображение" } : { id, type };
    onChange({ ...document, blocks: [...document.blocks, block] });
    onSelect(id);
  };

  const update = (patch: Partial<EmailBlock>) => onChange({ ...document, blocks: document.blocks.map((block) => block.id === selectedBlock ? { ...block, ...patch } as EmailBlock : block) });
  const remove = () => { if (!selectedBlock) return; onChange({ ...document, blocks: document.blocks.filter((block) => block.id !== selectedBlock) }); onSelect(null); };
  const current = document.blocks.find((block) => block.id === selectedBlock);
  const content = current && current.type !== "divider" ? (current.type === "image" ? current.alt ?? "" : current.text) : "";

  return <div className="stack builder-panel">
    <div className="row builder-add-buttons">{BLOCKS.map((block) => <button type="button" className="btn btn-sm" key={block.type} onClick={() => add(block.type)}>＋ {block.label}</button>)}</div>
    <div className="stack builder-block-list">{document.blocks.length === 0 ? <div className="small muted">Добавьте первый блок письма.</div> : document.blocks.map((block, index) => <button type="button" className="row small builder-block-item" key={block.id} onClick={() => onSelect(block.id)} style={{ background: block.id === selectedBlock ? "var(--accent-muted)" : "transparent" }}><span className="grow">{index + 1}. {BLOCKS.find((item) => item.type === block.type)?.label ?? "Блок"}</span><span className="muted">Выбрать</span></button>)}</div>
    {current && current.type !== "divider" && <div className="stack builder-selected-block"><div className="row"><label className="small grow">Содержимое выбранного блока</label><button type="button" className="btn btn-sm btn-outline-danger" onClick={remove}>Удалить блок</button></div><textarea className="input" rows={3} value={content} onChange={(event) => current.type === "image" ? update({ alt: event.target.value }) : update({ text: event.target.value })} />{current.type === "button" && <><label className="small">Ссылка кнопки</label><input className="input" value={current.url} onChange={(event) => update({ url: event.target.value })} /></>}{current.type === "image" && <><label className="small">Ссылка на изображение</label><input className="input" value={current.url} onChange={(event) => update({ url: event.target.value })} /></>}</div>}
  </div>;
}
