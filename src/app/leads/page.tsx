"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusPill } from "@/components/StatusPill";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";
import BlurText from "@/components/react-bits/BlurText";
import ShinyText from "@/components/react-bits/ShinyText";

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
const STATUSES = ["New", "Analyzed", "Contacted", "Replied", "Interested", "Not Now", "Client", "Lost", "Unsubscribed"];

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
      const res = await api<{ leads: Lead[] }>("/api/leads");
      setLeads(res.leads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // "/" focuses the search box (global shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.metaKey || e.ctrlKey) && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || "")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    let out = leads.filter((l) => {
      if (status !== "ALL" && l.status !== status) return false;
      if (tier === "HOT" && l.leadScore < 80) return false;
      if (tier === "WARM" && (l.leadScore < 50 || l.leadScore >= 80)) return false;
      if (tier === "COLD" && l.leadScore >= 50) return false;
      if (query && !`${l.name} ${l.companyOrChannel} ${l.email ?? ""} ${l.niche ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [leads, q, tier, status, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggleAll = () => {
    if (pageRows.length > 0 && pageRows.every((l) => selected.has(l.id))) setSelected(new Set());
    else setSelected(new Set(pageRows.map((l) => l.id)));
  };

  const bulkDelete = async () => {
    const count = selected.size;
    if (!count) return;
    if (!window.confirm(`Delete ${count} selected lead(s)? This cannot be undone.`)) return;
    let ok = 0;
    for (const id of selected) {
      try { await api(`/api/leads/${id}`, { method: "DELETE" }); ok++; } catch { /* continue */ }
    }
    setSelected(new Set());
    notify(`${ok} lead(s) deleted.`, "success");
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
    { key: "leadScore", label: "Score" },
    { key: "name", label: "Name" },
    { key: "companyOrChannel", label: "Company" },
    { key: "email", label: "Email" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Added" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <BlurText text="Лиды" className="page-title" delay={40} animateBy="words" />
          <p className="page-sub"><ShinyText text={`${leads.length} prospects in your pipeline`} speed={3} /></p>
        </div>
        <div className="row">
           <button className="btn btn-primary" onClick={() => setShowQuick(true)} style={{ background: "var(--accent, #2563eb)" }}>⚡ Быстро</button>
           <Link href="/leads/import" className="btn btn-primary">⇪ Импортировать лиды</Link>
           <Link href="/leads/new" className="btn">＋ Добавить лид</Link>
         </div>
      </div>

      <div className="toolbar">
        <div className="input-with-icon" style={{ flex: 1, maxWidth: 360 }}>
          <span className="icon" aria-hidden>🔍</span>
          <input ref={searchRef} className="input" placeholder="Search leads…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search leads" />
        </div>
        <select className="select" style={{ maxWidth: 150 }} value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} aria-label="Filter by score">
          <option value="ALL">All scores</option>
          <option value="HOT">HOT</option><option value="WARM">WARM</option><option value="COLD">COLD</option>
        </select>
        <select className="select" style={{ maxWidth: 160 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="ALL">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="search-hint">Press <span className="kbd">/</span> to search</span>
      </div>

      {selected.size > 0 && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, borderColor: "var(--accent)" }}>
          <strong>{selected.size} selected</strong>
          <span className="grow" />
          <button className="btn btn-sm btn-outline-danger" onClick={bulkDelete}>Удалить выбранные</button>
        </div>
      )}

      {error && <div className="card" style={{ padding: 12, color: "var(--red)", marginBottom: 12 }}>{error}</div>}


      {loading ? (
        <div className="card" style={{ padding: 24 }}>
          <div className="skeleton" style={{ height: 20, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 34, marginBottom: 8 }} />
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="es-icon" aria-hidden>{leads.length === 0 ? "◈" : "🔍"}</div>
          <div className="es-title">{leads.length === 0 ? "Your pipeline is empty" : "No matches"}</div>
          <div className="es-sub">
            {leads.length === 0
              ? "Импортируйте контакты из CSV, XLSX или Google Sheets, чтобы начать работу."
              : "Try adjusting your search or filters."}
          </div>
          {leads.length === 0 && <Link href="/leads/import" className="btn btn-primary" style={{ marginTop: 8 }}>Импортировать лиды</Link>}
        </div>
      ) : (
        <PageTransition>
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={pageRows.length > 0 && pageRows.every((l) => selected.has(l.id))} onChange={toggleAll} aria-label="Select all on page" /></th>
                  {columns.map((c) => (
                    <th key={c.key}>
                      <span className="th-sort" onClick={() => toggleSort(c.key)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && toggleSort(c.key)}>
                        {c.label}
                        {sortKey === c.key && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((l, i) => (
                  <tr key={l.id} style={{ ["--row-i" as string]: i }} className={selected.has(l.id) ? "selected" : ""}>
                    <td data-label="Select"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} aria-label={`Select ${l.name}`} /></td>
                    <td data-label="Score"><ScoreBadge score={l.leadScore} /></td>
                    <td data-label="Name"><Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.name}</Link></td>
                    <td data-label="Company">{l.companyOrChannel || <span className="muted">—</span>}</td>
                    <td data-label="Email" style={{ wordBreak: "break-all" }}>{l.email || <span className="muted">—</span>}</td>
                    <td data-label="Status"><StatusPill status={l.status} /></td>
                    <td data-label="Added">{formatDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ padding: "12px 16px", justifyContent: "space-between" }}>
            <span className="small muted">{filtered.length} lead(s) · page {safePage}/{pages}</span>
            <div className="row">
              <button className="btn btn-sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <button className="btn btn-sm" disabled={safePage >= pages} onClick={() => setPage((p) => p + 1)}>Далее →</button>
            </div>
          </div>
        </div>
        </PageTransition>
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
