import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "ClipReach — персональные рассылки",
  description: "Рабочее пространство для персонализированных писем и работы с лидами.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="ru">
      <body>
        <ToastProvider>
          {user ? (
            <Shell email={user.email} initialPaused={user.outreachPaused}>
              {children}
            </Shell>
          ) : (
            children
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
