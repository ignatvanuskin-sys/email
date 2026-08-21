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
    </div>
  );
}
