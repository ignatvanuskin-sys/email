"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import Image from "next/image";

const PRIMARY_LINKS = [
  { href: "/", label: "Главная", icon: "⌂" },
  { href: "/leads", label: "Контакты", icon: "◈" },
  { href: "/campaigns", label: "Рассылки", icon: "✦" },
  { href: "/inbox", label: "Ответы", icon: "✉" },
  { href: "/follow-ups", label: "Повторные контакты", icon: "↻" },
  { href: "/templates", label: "Шаблоны", icon: "□" },
  { href: "/settings", label: "Настройки", icon: "⚙" },
];

const ADVANCED_LINKS = [
  { href: "/activation", label: "Мастер запуска", icon: "→" },
  { href: "/analytics", label: "Аналитика", icon: "◒" },
  { href: "/deliverability", label: "Доставляемость", icon: "◇" },
  { href: "/segments", label: "Группы контактов", icon: "◎" },
  { href: "/sequences", label: "Автоматические цепочки", icon: "⇉" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export function Nav({
  email,
  paused,
  onTogglePause,
  branding,
}: {
  email: string;
  paused: boolean;
  onTogglePause: () => void;
  branding?: { name: string; logoUrl: string | null; brandColor: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const advancedActive = ADVANCED_LINKS.some((link) => isActive(pathname, link.href));

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="sidebar sidebar-premium">
      <div className="sidebar-brand">
        {branding?.logoUrl ? <Image src={branding.logoUrl} alt="" width={24} height={24} unoptimized style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 6 }} /> : <span className="mark" aria-hidden />}
        <span>{branding?.name || "ClipReach"}</span>
      </div>
      <div className="sidebar-kicker">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav aria-label="Основная навигация">
        {PRIMARY_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={`nav-link ${isActive(pathname, link.href) ? "active" : ""}`}>
            <span aria-hidden className="nav-icon">{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        ))}
        <details className={`nav-more ${advancedActive ? "active" : ""}`} open={advancedActive}>
          <summary className="nav-link"><span aria-hidden className="nav-icon">•••</span><span>Дополнительно</span><span className="nav-more-chevron" aria-hidden>⌄</span></summary>
          <div className="nav-more-list">
            {ADVANCED_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={`nav-link nav-link-nested ${isActive(pathname, link.href) ? "active" : ""}`}>
                <span aria-hidden className="nav-icon">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </details>
      </nav>
      <div className="sidebar-quick-actions">
        <Link href="/leads/new" className="btn btn-primary btn-block">＋ Добавить контакт</Link>
      </div>

      <div className="sidebar-footer stack" style={{ gap: 10 }}>
        <button className={`pause-control ${paused ? "paused" : "active"}`} onClick={onTogglePause} aria-pressed={paused}>
          <span className={`pulse-dot ${paused ? "paused" : "live"}`} aria-hidden />
          <span className="pause-label">{paused ? "РАССЫЛКА ПРИОСТАНОВЛЕНА" : "РАССЫЛКА АКТИВНА"}</span>
          <span aria-hidden>{paused ? "▶" : "⏹"}</span>
        </button>
        <div className="small">
          <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{email}</div>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn-ghost-danger btn-sm" onClick={logout}>Выйти</button>
            <span className="kbd" title="Открыть быстрые действия">⌘K</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
