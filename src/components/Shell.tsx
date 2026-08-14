"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav } from "./Nav";
import { CommandPalette } from "./CommandPalette";
import { api } from "@/lib/client";
import { useToast } from "./Toast";

export function Shell({
  email,
  initialPaused,
  children,
}: {
  email: string;
  initialPaused: boolean;
  children: React.ReactNode;
}) {
  const [paused, setPaused] = useState(initialPaused);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { notify } = useToast();

  const togglePause = useCallback(async () => {
    const next = !paused;
    try {
      await api("/api/settings/pause", { method: "POST", body: JSON.stringify({ paused: next }) });
      setPaused(next);
      notify(next ? "Outreach paused — no new emails will be sent." : "Outreach resumed.", "info");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Не удалось изменить состояние рассылки", "error");
    }
  }, [paused, notify]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      <Nav email={email} paused={paused} onTogglePause={togglePause} />
      <main className="main">{children}</main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} paused={paused} onTogglePause={togglePause} />
    </div>
  );
}
