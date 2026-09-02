"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type FormState = {
  name: string;
  companyOrChannel: string;
  email: string;
  websiteUrl: string;
  youtubeUrl: string;
  niche: string;
  followersCount: string;
};

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ name: "", companyOrChannel: "", email: "", websiteUrl: "", youtubeUrl: "", niche: "", followersCount: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await api<{ lead: { id: string } }>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          companyOrChannel: form.companyOrChannel,
          email: form.email || null,
          websiteUrl: form.websiteUrl || null,
          youtubeUrl: form.youtubeUrl || null,
          niche: form.niche || null,
          followersCount: form.followersCount ? Number(form.followersCount) : null,
        }),
      });
      router.push(`/leads/${response.lead.id}`);
    } catch {
      setError("Не удалось сохранить контакт. Проверьте данные и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div><h1 className="page-title">Новый контакт</h1><p className="page-sub">Заполните только то, что знаете. Остальное можно добавить позже.</p></div>
        <Link href="/leads" className="btn">← К контактам</Link>
      </div>
      <form className="card form-card" onSubmit={submit}>
        <div className="field"><label htmlFor="lead-name">Имя или название *</label><input id="lead-name" className="input" value={form.name} onChange={set("name")} required placeholder="Например, Алексей Иванов" /></div>
        <div className="field"><label htmlFor="lead-email">Электронная почта</label><input id="lead-email" className="input" type="email" value={form.email} onChange={set("email")} placeholder="alex@example.com" /></div>
        <div className="field"><label htmlFor="lead-company">Компания или канал</label><input id="lead-company" className="input" value={form.companyOrChannel} onChange={set("companyOrChannel")} placeholder="Например, подкаст или компания»" /></div>
        <details className="form-extra">
          <summary>Добавить дополнительные сведения</summary>
          <div className="form-extra-content">
            <div className="field"><label htmlFor="lead-website">Сайт</label><input id="lead-website" className="input" type="url" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="https://example.com" /></div>
            <div className="field"><label htmlFor="lead-youtube">Ссылка на YouTube</label><input id="lead-youtube" className="input" type="url" value={form.youtubeUrl} onChange={set("youtubeUrl")} placeholder="https://youtube.com/@channel" /></div>
            <div className="field"><label htmlFor="lead-niche">Сфера</label><input id="lead-niche" className="input" value={form.niche} onChange={set("niche")} placeholder="Образование, бизнес, подкасты" /></div>
            <div className="field"><label htmlFor="lead-followers">Количество подписчиков</label><input id="lead-followers" className="input" type="number" min={0} value={form.followersCount} onChange={set("followersCount")} placeholder="Необязательно" /></div>
          </div>
        </details>
        {error && <div className="friendly-error" role="alert">{error}</div>}
        <div className="form-actions"><Link href="/leads" className="btn">Отмена</Link><button className="btn btn-primary btn-lg" disabled={loading}>{loading ? "Сохраняем…" : "Сохранить контакт"}</button></div>
      </form>
    </div>
  );
}
