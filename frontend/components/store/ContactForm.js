"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

/** Contact form -> POST /contact (saved to Admin -> Messages). Phone or email is required. */
export default function ContactForm({ t }) {
  const [values, setValues] = useState({ name: "", phone: "", email: "", message: "", website: "" });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    const local = {};
    if (values.name.trim().length < 2) local.name = t.errors.name;
    if (!values.phone.trim() && !values.email.trim()) local.phone = t.errors.contact;
    if (values.message.trim().length < 10) local.message = t.errors.message;
    setErrors(local);
    if (Object.keys(local).length) return;

    setStatus("sending");
    try {
      const response = await fetch(`${API}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          phone: values.phone.replace(/[\s-]/g, "") || undefined,
          email: values.email.trim() || undefined,
          message: values.message.trim(),
          website: values.website,
        }),
      });
      if (response.ok) {
        setStatus("sent");
        return;
      }
      const body = await response.json().catch(() => ({}));
      const server = {};
      for (const [key, messages] of Object.entries(body.errors || {})) server[key] = messages[0];
      setErrors(Object.keys(server).length ? server : { form: response.status === 429 ? t.errors.tooMany : t.errors.generic });
      setStatus("error");
    } catch {
      setErrors({ form: t.errors.network });
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center rounded-3xl bg-white p-10 text-center ring-1 ring-ivory-200">
        <CheckCircle2 className="size-12 text-teal-500" strokeWidth={1.5} />
        <p className="mt-4 font-display text-2xl text-navy-900">{t.sentTitle}</p>
        <p className="mt-2 text-sm text-ink/65">{t.sentText}</p>
      </div>
    );
  }

  const field = "h-12 w-full rounded-xl border border-ivory-300 bg-white px-4 text-sm outline-none transition focus:border-navy-900 aria-[invalid=true]:border-lotus-500";
  const label = "mb-1.5 block text-sm font-medium text-navy-900";
  const err = (key) => errors[key] && <p className="mt-1.5 text-xs text-lotus-600">{errors[key]}</p>;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-3xl bg-white p-6 shadow-[0_10px_40px_-20px_rgba(15,27,53,0.25)] ring-1 ring-ivory-200 sm:grid-cols-2 sm:p-8">
      <div className="sm:col-span-2">
        <label htmlFor="ct-name" className={label}>
          {t.name} *
        </label>
        <input id="ct-name" autoComplete="name" value={values.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} className={field} />
        {err("name")}
      </div>
      <div>
        <label htmlFor="ct-phone" className={label}>
          {t.phone}
        </label>
        <input id="ct-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" value={values.phone} onChange={set("phone")} aria-invalid={Boolean(errors.phone)} className={field} />
        {err("phone")}
      </div>
      <div>
        <label htmlFor="ct-email" className={label}>
          {t.email}
        </label>
        <input id="ct-email" type="email" autoComplete="email" value={values.email} onChange={set("email")} aria-invalid={Boolean(errors.email)} className={field} />
        {err("email")}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="ct-message" className={label}>
          {t.message} *
        </label>
        <textarea id="ct-message" rows={5} maxLength={2000} value={values.message} onChange={set("message")} aria-invalid={Boolean(errors.message)} placeholder={t.messageHint} className={`${field} h-auto py-3`} />
        {err("message")}
      </div>
      <div className="absolute -left-[9999px]" aria-hidden>
        <label htmlFor="ct-website">Website</label>
        <input id="ct-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
      </div>
      {errors.form && (
        <p className="text-sm text-lotus-600 sm:col-span-2" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={status === "sending"} className="flex h-12 items-center justify-center gap-2 rounded-full bg-navy-900 px-8 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-navy-800 disabled:opacity-60 sm:col-span-2 sm:justify-self-start">
        {status === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t.send}
      </button>
    </form>
  );
}
