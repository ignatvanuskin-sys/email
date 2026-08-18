"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import BlurText from "@/components/react-bits/BlurText";
import FadeContent from "@/components/react-bits/FadeContent";
import ClickSpark from "@/components/react-bits/ClickSpark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <FadeContent blur duration={0.7} threshold={0}>
        <div className="card card-glass" style={{ width: 380, padding: 28 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="mark" style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#ff5c1f,#ffb37a)", display: "inline-block" }} />
            <span style={{ fontSize: 20, fontWeight: 700 }}>ClipReach</span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <BlurText text="С возвращением" className="page-title" delay={50} animateBy="words" />
          </div>
          <p className="page-sub" style={{ marginBottom: 20 }}>
            Войдите в рабочее пространство рассылок.
          </p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Электронная почта</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Пароль</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="small" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>}
            <ClickSpark sparkColor="rgba(255,255,255,0.8)" sparkSize={7} sparkRadius={18} sparkCount={10}>
              <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
                {loading ? "Вход…" : "Войти"}
              </button>
            </ClickSpark>
          </form>
          <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
            Нет аккаунта?{" "}
            <Link href="/register" style={{ color: "var(--accent)", fontWeight: 600 }}>Создать</Link>
          </p>
        </div>
      </FadeContent>
    </div>
  );
}
