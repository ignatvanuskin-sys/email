"use client";

import Link from "next/link";

export function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-shell">
      <div className="demo-banner">
        <span><strong>Демо-режим</strong> · Данные примера доступны для просмотра.</span>
        <Link href="/register" className="btn btn-sm btn-primary">Создать аккаунт</Link>
      </div>
      {children}
    </div>
  );
}
