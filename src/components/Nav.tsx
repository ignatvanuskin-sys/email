"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import Image from "next/image";

const LINKS = [
  { href: "/", label: "Главная", icon: "⌂" },
  { href: "/analytics", label: "Analytics", icon: "◒" },
  { href: "/leads", label: "Лиды", icon: "◈" },
  { href: "/campaigns", label: "Campaigns", icon: "📣" },
  { href: "/activation", label: "Launch wizard", icon: "✦" },
  { href: "/sequences", label: "Sequences", icon: "⇉" },
  { href: "/templates", label: "Templates", icon: "📝" },
  { href: "/segments", label: "Segments", icon: "🎯" },
  { href: "/follow-ups", label: "Повторные контакты", icon: "⏰" },
  { href: "/inbox", label: "Reply inbox", icon: "✉" },
  { href: "/deliverability", label: "Доставляемость", icon: "◇" },
  { href: "/settings", label: "Настройки", icon: "⚙" },
];

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

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
         {branding?.logoUrl ? <Image src={branding.logoUrl} alt="" width={24} height={24} unoptimized style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 6 }} /> : <span className="mark" aria-hidden />}
         <span>{branding?.name || "ClipReach"}</span>
      </div>
      <nav aria-label="Main navigation">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link ${pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href)) ? "active" : ""}`}
          >
            <span aria-hidden style={{ width: 18, textAlign: "center" }}>{l.icon}</span>
            <span>{l.label}</span>
          </Link>
        ))}
        <Link
          href="/leads/import"
          className={`nav-link ${pathname === "/leads/import" ? "active" : ""}`}
        >
          <span aria-hidden style={{ width: 18, textAlign: "center" }}>⇪</span>
          <span>Import leads</span>
        </Link>
        <Link href="/leads/new" className={`nav-link ${pathname === "/leads/new" ? "active" : ""}`}>
          <span aria-hidden style={{ width: 18, textAlign: "center" }}>＋</span>
          <span>Новый лид</span>
        </Link>
      </nav>

      <div className="sidebar-footer stack" style={{ gap: 10 }}>
        <button
          className={`pause-control ${paused ? "paused" : "active"}`}
          onClick={onTogglePause}
          aria-pressed={paused}
        >
          <span className={`pulse-dot ${paused ? "paused" : "live"}`} aria-hidden />
          <span className="pause-label">{paused ? "OUTREACH PAUSED" : "OUTREACH ACTIVE"}</span>
          <span aria-hidden>{paused ? "▶" : "⏹"}</span>
        </button>

        <div className="small">
          <div style={{ fontWeight: 600 }}>{email}</div>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn-ghost-danger btn-sm" onClick={logout}>
              Log out
            </button>
            <span className="kbd" title="Open command palette">⌘K</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
