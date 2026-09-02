"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusPill } from "@/components/StatusPill";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { leadStatusLabels } from "@/lib/uiLabels";

type Lead = {
  id: string;
  name: string;
  companyOrChannel: string;
  email: string | null;
  niche: string | null;
  leadScore: number;
  scoreBreakdown: unknown;
  status: string;
  createdAt: string;
};

type SortKey = "name" | "email" | "companyOrChannel" | "leadScore" | "status" | "createdAt";
const PAGE_SIZE = 12;
const STATUS_OPTIONS = Object.entries(leadStatusLabels);

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("leadScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showQuick, setShowQuick] = useState(false);
  const [quickTab, setQuickTab] = useState<"single" | "table">("single");
  const [quickSingle, setQuickSingle] = useState({ email: "", name: "", company: "" });
  const [quickPaste, setQuickPaste] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickMsg, setQuickMsg] = useState("");
  const { notify } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await api<{ leads: Lead[] }>("/api/leads");
      setLeads(res.leads);
    } catch {
      setError("Не удалось загрузить контакты. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !(event.metaKey || event.ctrlKey) && !/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || "")) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return leads
      .filter((lead) => {
        if (status !== "ALL" && lead.status !== status) return false;
        if (tier === "HOT" && lead.leadScore < 80) return false;
        if (tier === "WARM" && (lead.leadScore < 50 || lead.leadScore >= 80)) return false;
        if (tier === "COLD" && lead.leadScore >= 50) return false;
        if (query && !`${lead.name} ${lead.companyOrChannel} ${lead.email ?? ""} ${lead.niche ?? ""}`.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? comparison : -comparison;
      });
  }, [leads, q, tier, status, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((direction) => direction === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (pageRows.length > 0 && pageRows.every((lead) => selected.has(lead.id))) setSelected(new Set());
    else setSelected(new Set(pageRows.map((lead) => lead.id)));
  };

  const clearFilters = () => {
    setQ("");
    setTier("ALL");
    setStatus("ALL");
    setPage(1);
  };

  const bulkDelete = async () => {
    const count = selected.size;
    if (!count) return;
    if (!window.confirm(`Удалить выбранные контакты (${count})? Это действие нельзя отменить.`)) return;
    let removed = 0;
    for (const id of selected) {
      try {
        await api(`/api/leads/${id}`, { method: "DELETE" });
        removed++;
      } catch {
        // Один неудачный контакт не должен отменять остальные удаления.
      }
    }
    setSelected(new Set());
    notify(`Удалено контактов: ${removed}.`, "success");
    await load();
  };

  const handleQuickSingle = async () => {
    if (!quickSingle.email.trim()) { setQuickMsg("Email обязателен"); return; }
    setQuickBusy(true); setQuickMsg("");
    try {
      await api("/api/leads", { method: "POST", body: JSON.stringify({ email: quickSingle.email.trim(), name: quickSingle.name.trim() || quickSingle.email.split("@")[0], companyOrChannel: quickSingle.company.trim() }) });
      notify("Контакт добавлен", "success");
      setQuickSingle({ email: "", name: "", company: "" });
      setShowQuick(false);
      await load();
    } catch (e) { setQuickMsg(e instanceof Error ? e.message : "Ошибка"); }
    finally { setQuickBusy(false); }
  };

  const parsePaste = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const emailRe = /[^\s@]+@[^\s@]+\.[^\s@]+/;
    // detect header: first line has no email but contains header keywords
    const headerKeywords = ["email","почта","e-mail","mail","name","имя","фио","company","компания","канал"];
    const first = lines[0].toLowerCase();
    const hasHeader = !emailRe.test(lines[0]) && headerKeywords.some((k) => first.includes(k));
    const dataLines = hasHeader ? lines.slice(1) : lines;
    // detect delimiter by majority
    const sample = dataLines.slice(0, 5).join("\n");
    let delim: string = ",";
    if (sample.includes("\t")) delim = "\t";
    else if (sample.includes(";") && !sample.includes(",")) delim = ";";
    // if single column with spaces, try to split by 2+ spaces
    return dataLines.map((line) => {
      // "Name <email>" pattern
      const angle = line.match(/^(.*)<\s*([^\s@]+@[^\s@]+\.[^\s@]+)\s*>$/);
      if (angle) return { name: angle[1].trim().replace(/^"|"$/g,""), email: angle[2].trim(), companyOrChannel: "" };
      let parts: string[];
      if (delim === "\t") parts = line.split("\t").map((s) => s.trim());
      else if (delim === ";") parts = line.split(";").map((s) => s.trim());
      else if (line.includes(",")) parts = line.split(",").map((s) => s.trim());
      else if (/\s{2,}/.test(line)) parts = line.split(/\s{2,}/).map((s) => s.trim());
      else parts = line.split(/\s+/).map((s) => s.trim());
      // Remove empty and handle quoted
      parts = parts.map((p) => p.replace(/^"|"$/g, "").trim()).filter(Boolean);
      // Find email token
      const emailIdx = parts.findIndex((p) => emailRe.test(p));
      let email = emailIdx >= 0 ? parts[emailIdx].match(emailRe)?.[0] ?? "" : "";
      // If no email found but line has one token with @
      if (!email && emailRe.test(line)) email = line.match(emailRe)?.[0] ?? "";
      const nameTokens = parts.filter((_, i) => i !== emailIdx);
      // Heuristic: if 1 token after removing email, it's name; if 2+ first is name, second company
      let name = "";
      let company = "";
      if (nameTokens.length === 1) name = nameTokens[0];
      else if (nameTokens.length >= 2) { name = nameTokens[0]; company = nameTokens[1]; }
      // If angle not matched and name empty but email present, use email prefix
      if (!name && email) name = email.split("@")[0];
      return { email: email.trim(), name: name.trim(), companyOrChannel: company.trim() };
    }).filter((r) => r.email);
  };

  const handleQuickTable = async () => {
    const leads = parsePaste(quickPaste);
    if (!leads.length) { setQuickMsg("Не найдено ни одного email. Формат: email, имя, компания (таб/запятая/пробел)"); return; }
    if (leads.length > 500) { setQuickMsg("Максимум 500 строк за раз"); return; }
    setQuickBusy(true); setQuickMsg("");
    try {
      const res = await api<{ imported: number; duplicates: number; invalid: number } >("/api/leads/bulk", { method: "POST", body: JSON.stringify({ leads }) });
      notify(`Импортировано ${res.imported}, дубликатов ${res.duplicates}, ошибок ${res.invalid}`, res.imported ? "success" : "info");
      setQuickPaste("");
      setShowQuick(false);
      await load();
    } catch (e) { setQuickMsg(e instanceof Error ? e.message : "Ошибка импорта"); }
    finally { setQuickBusy(false); }
  };

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "leadScore", label: "Оценка" },
    { key: "name", label: "Имя" },
    { key: "companyOrChannel", label: "Компания или канал" },
    { key: "email", label: "Электронная почта" },
    { key: "status", label: "Статус" },
    { key: "createdAt", label: "Добавлен" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Контакты</h1>
          <p className="page-sub">{leads.length === 0 ? "Добавьте первый контакт или импортируйте готовый список." : `${leads.length} контактов в рабочем пространстве.`}</p>
        </div>
        <div className="row contacts-actions">
          <button className="btn btn-primary" onClick={() => setShowQuick(true)}>⚡ Быстро</button>
          <Link href="/leads/import" className="btn">Импортировать</Link>
          <Link href="/leads/new" className="btn btn-primary">＋ Добавить контакт</Link>
        </div>
      </div>

      <div className="toolbar contacts-toolbar">
        <div className="input-with-icon contacts-search">
          <span className="icon" aria-hidden>⌕</span>
          <input ref={searchRef} className="input" placeholder="Поиск по имени, компании или email" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} aria-label="Поиск контактов" />
        </div>
        <select className="select" value={tier} onChange={(event) => { setTier(event.target.value); setPage(1); }} aria-label="Фильтр по оценке">
          <option value="ALL">Все оценки</option>
          <option value="HOT">Высокая оценка</option>
          <option value="WARM">Средняя оценка</option>
          <option value="COLD">Низкая оценка</option>
        </select>
        <select className="select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Фильтр по статусу">
          <option value="ALL">Все статусы</option>
          {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <span className="search-hint">Быстрый поиск: <span className="kbd">/</span></span>
      </div>

      {selected.size > 0 && <div className="card contacts-selection"><strong>Выбрано: {selected.size}</strong><span className="grow" /><button className="btn btn-sm btn-outline-danger" onClick={bulkDelete}>Удалить выбранные</button></div>}
      {error && <div className="card friendly-error" role="alert">{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: 24 }} aria-label="Загрузка контактов"><div className="skeleton" style={{ height: 20, marginBottom: 12 }} /><div className="skeleton" style={{ height: 34, marginBottom: 8 }} />{Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="es-icon" aria-hidden>{leads.length === 0 ? "◈" : "⌕"}</div>
          <div className="es-title">{leads.length === 0 ? "Контактов пока нет" : "Ничего не найдено"}</div>
          <div className="es-sub">{leads.length === 0 ? "Импортируйте CSV/XLSX или добавьте контакт вручную, чтобы начать работу." : "Измените запрос или сбросьте фильтры."}</div>
          {leads.length === 0 ? <Link href="/leads/import" className="btn btn-primary">Импортировать контакты</Link> : <button className="btn btn-primary" onClick={clearFilters}>Сбросить фильтры</button>}
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={pageRows.length > 0 && pageRows.every((lead) => selected.has(lead.id))} onChange={toggleAll} aria-label="Выбрать все контакты на странице" /></th>{columns.map((column) => <th key={column.key}><button className="th-sort th-sort-button" onClick={() => toggleSort(column.key)}>{column.label}{sortKey === column.key && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}</button></th>)}</tr></thead>
              <tbody>{pageRows.map((lead, index) => <tr key={lead.id} style={{ ["--row-i" as string]: index }} className={selected.has(lead.id) ? "selected" : ""}>
                <td data-label="Выбрать"><input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} aria-label={`Выбрать контакт ${lead.name}`} /></td>
                <td data-label="Оценка"><ScoreBadge score={lead.leadScore} /></td>
                <td data-label="Имя"><Link href={`/leads/${lead.id}`} style={{ fontWeight: 650 }}>{lead.name}</Link></td>
                <td data-label="Компания или канал">{lead.companyOrChannel || <span className="muted">Не указано</span>}</td>
                <td data-label="Электронная почта" style={{ wordBreak: "break-word" }}>{lead.email || <span className="muted">Не указана</span>}</td>
                <td data-label="Статус"><StatusPill status={lead.status} /></td>
                <td data-label="Добавлен">{formatDate(lead.createdAt)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="row contacts-pagination"><span className="small muted">{filtered.length} контактов · страница {safePage} из {pages}</span><div className="row"><button className="btn btn-sm" disabled={safePage <= 1} onClick={() => setPage((current) => current - 1)}>← Назад</button><button className="btn btn-sm" disabled={safePage >= pages} onClick={() => setPage((current) => current + 1)}>Далее →</button></div></div>
        </div>
      )}
      {showQuick && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"grid", placeItems:"center", zIndex:80, padding:16 }} onClick={() => !quickBusy && setShowQuick(false)}>
          <div className="card" style={{ width:"100%", maxWidth:560, padding:20, maxHeight:"90vh", overflowY:"auto" }} onClick={(e)=>e.stopPropagation()}>
            <div className="row" style={{ justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <h3 style={{ margin:0 }}>⚡ Быстрое добавление</h3>
              <button className="btn btn-sm" onClick={()=>setShowQuick(false)}>✕</button>
            </div>
            <div className="tabs" role="tablist" style={{ marginBottom:16 }}>
              <button role="tab" aria-selected={quickTab==="single"} className={`tab ${quickTab==="single"?"active":""}`} onClick={()=>setQuickTab("single")}>Один контакт</button>
              <button role="tab" aria-selected={quickTab==="table"} className={`tab ${quickTab==="table"?"active":""}`} onClick={()=>setQuickTab("table")}>Таблица / Паста</button>
            </div>
            {quickTab==="single" ? (
              <div className="stack" style={{ gap:12 }}>
                <div className="field"><label>Email *</label><input className="input" type="email" placeholder="alex@example.com" value={quickSingle.email} onChange={(e)=>setQuickSingle({...quickSingle,email:e.target.value})} /></div>
                <div className="field"><label>Имя</label><input className="input" placeholder="Alex Rivera" value={quickSingle.name} onChange={(e)=>setQuickSingle({...quickSingle,name:e.target.value})} /></div>
                <div className="field"><label>Компания / Канал</label><input className="input" placeholder="Acme Inc." value={quickSingle.company} onChange={(e)=>setQuickSingle({...quickSingle,company:e.target.value})} /></div>
                {quickMsg && <div className="small" style={{ color:"var(--red)" }}>{quickMsg}</div>}
                <div className="row" style={{ justifyContent:"flex-end" }}>
                  <button className="btn" onClick={()=>setShowQuick(false)} disabled={quickBusy}>Отмена</button>
                  <button className="btn btn-primary" onClick={handleQuickSingle} disabled={quickBusy || !quickSingle.email.trim()}>{quickBusy?"Добавление…":"Добавить"}</button>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap:12 }}>
                <p className="small muted" style={{ margin:0 }}>Вставьте строки из Excel/Google Sheets. Поддерживается <b>таб, запятая, точка с запятой</b>. Форматы: <code>email</code> · <code>email, Имя, Компания</code> · <code>Имя &lt;email&gt;</code></p>
                <textarea className="input" rows={8} placeholder={"ivan@test.ru\tИван\tООО Тест\nalex@example.com, Alex Rivera, Acme\njane@example.com Jane Corp"} value={quickPaste} onChange={(e)=>setQuickPaste(e.target.value)} style={{ fontFamily:"monospace", fontSize:13 }} />
                <div className="small muted">Строк: {quickPaste.split(/\r?\n/).filter((l)=>l.trim()).length} · Найдено email: {parsePaste(quickPaste).length}</div>
                {quickPaste && parsePaste(quickPaste).length>0 && (
                  <div className="table-wrap" style={{ maxHeight:160, border:"1px solid var(--border)", borderRadius:8 }}>
                    <table className="data-table"><thead><tr><th>Email</th><th>Имя</th><th>Компания</th></tr></thead><tbody>{parsePaste(quickPaste).slice(0,20).map((r,i)=><tr key={i}><td>{r.email}</td><td>{r.name}</td><td>{r.companyOrChannel}</td></tr>)}</tbody></table>
                    {parsePaste(quickPaste).length>20 && <div className="small muted" style={{ padding:6, textAlign:"center" }}>… и ещё {parsePaste(quickPaste).length-20}</div>}
                  </div>
                )}
                {quickMsg && <div className="small" style={{ color:"var(--red)" }}>{quickMsg}</div>}
                <div className="row" style={{ justifyContent:"flex-end" }}>
                  <button className="btn" onClick={()=>setShowQuick(false)} disabled={quickBusy}>Отмена</button>
                  <button className="btn btn-primary" onClick={handleQuickTable} disabled={quickBusy || !quickPaste.trim()}>{quickBusy?"Импорт…":`Импортировать ${parsePaste(quickPaste).length || ""}`}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
