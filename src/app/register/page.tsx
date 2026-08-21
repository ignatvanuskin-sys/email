"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import BlurText from "@/components/react-bits/BlurText";
import FadeContent from "@/components/react-bits/FadeContent";
import ClickSpark from "@/components/react-bits/ClickSpark";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState(
    "Например: помогаю компаниям находить клиентов через персональные письма.",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Введите имя."); return; }
    if (!email.trim()) { setError("Введите электронную почту."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("Введите корректный адрес электронной почты."); return; }
    if (password.length < 8) { setError("Пароль должен содержать не менее 8 символов."); return; }
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, businessDescription: business }),
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError("Не удалось создать аккаунт. Проверьте введённые данные и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <FadeContent blur duration={0.7} threshold={0}>
        <div className="card card-glass" style={{ width: 440, padding: 28 }}>
          <div style={{ marginBottom: 6 }}>
            <BlurText text="Создайте рабочее пространство" className="page-title" delay={50} animateBy="words" />
          </div>
          <p className="page-sub" style={{ marginBottom: 20 }}>
            Настройте пространство и начните находить клиентов за несколько минут.
          </p>
          <form onSubmit={submit} noValidate aria-describedby={error ? "register-error" : undefined}>
            <div className="field">
              <label htmlFor="register-name">Имя</label>
              <input id="register-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Алексей Иванов" autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="register-email">Электронная почта</label>
              <input id="register-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={Boolean(error && !email.trim())} />
            </div>
            <div className="field">
              <label htmlFor="register-password">Пароль (минимум 8 символов)</label>
              <input id="register-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="register-password-hint" />
              <div id="register-password-hint" className="field-hint">Не используйте пароль от другого сервиса.</div>
            </div>
            <div className="field">
              <label htmlFor="register-business">Какую услугу вы продаёте?</label>
              <textarea id="register-business" className="input" value={business} onChange={(e) => setBusiness(e.target.value)} rows={3} />
            </div>
            {error && <div id="register-error" className="small friendly-error" role="alert">{error}</div>}
            <ClickSpark sparkColor="rgba(255,255,255,0.8)" sparkSize={7} sparkRadius={18} sparkCount={10}>
              <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
                {loading ? "Создание аккаунта…" : "Создать аккаунт"}
              </button>
            </ClickSpark>
          </form>
          <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
            Уже есть аккаунт?{" "}
            <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600 }}>Войти</Link>
          </p>
        </div>
      </FadeContent>
    </div>
  );
}
