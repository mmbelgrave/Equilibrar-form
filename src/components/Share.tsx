"use client";

import { useTranslations } from "next-intl";
import { useState, type RefObject } from "react";
import { RE_WHATSAPP } from "@/lib/links";
import { enabled as dbEnabled, shareMap, type ContactDetails } from "@/lib/db";
import type { Personal } from "@/lib/conclusion";
import type { MapResult, Path } from "@/lib/scoring";

type HeadingRef = RefObject<HTMLHeadingElement | null>;

const emptyContact = (firstName: string): ContactDetails => ({
  firstName,
  email: "",
  whatsapp: "",
  instagram: "",
  consentShare: false,
  consentEmail: false,
});

/** WhatsApp is how Rê works one to one, so the two personal paths need it. */
const needsWhatsapp = (path: Path | null) => path === "consultoria" || path === "mentorship";

function Field({
  id,
  label,
  hint,
  type = "text",
  value,
  onChange,
  required,
  autoComplete,
}: {
  id: string;
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <p className="flex flex-col gap-1">
      <label htmlFor={id} className="t-label">
        {label}
      </label>
      {hint && (
        <span className="t-helper" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-base"
      />
    </p>
  );
}

/**
 * The contact form and "Share my Map with Rê" (spec v4 §3, §12): the confirming action of
 * the whole Map. Nothing identifying has been saved before this point, and nothing is sent
 * unless the first consent box is ticked.
 */
export function ShareForm({
  mapId,
  chosenPath,
  personal,
  onShared,
}: {
  mapId: string | null;
  chosenPath: Path | null;
  personal: Personal;
  onShared: () => void;
}) {
  const t = useTranslations();
  const [contact, setContact] = useState<ContactDetails>(() => emptyContact(personal.name));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const set = <K extends keyof ContactDetails>(key: K, value: ContactDetails[K]) =>
    setContact((c) => ({ ...c, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.email.trim()) return setError(t("contact.needEmail"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) return setError(t("contact.needEmailValid"));
    if (needsWhatsapp(chosenPath) && !contact.whatsapp.trim()) return setError(t("contact.needWhatsapp"));
    if (!contact.consentShare) return setError(t("contact.needConsent"));
    if (!dbEnabled || !mapId) return setError(t("contact.notReady"));

    setError(null);
    setSending(true);
    const ok = await shareMap(mapId, chosenPath, { ...contact, email: contact.email.trim() }, personal);
    setSending(false);
    if (ok) onShared();
    else setError(t("contact.failed"));
  }

  return (
    <form className="card flex flex-col gap-4 px-4 py-4" onSubmit={submit} noValidate>
      <h2 className="t-pillar !text-xl">{t("contact.title")}</h2>
      <p>{t("contact.lead")}</p>
      <Field id="c-name" label={t("contact.name")} value={contact.firstName} onChange={(v) => set("firstName", v)} autoComplete="given-name" />
      <Field id="c-email" label={t("contact.email")} type="email" value={contact.email} onChange={(v) => set("email", v)} required autoComplete="email" />
      <Field
        id="c-whats"
        label={t("contact.whatsapp")}
        hint={t("contact.whatsappHint")}
        type="tel"
        value={contact.whatsapp}
        onChange={(v) => set("whatsapp", v)}
        required={needsWhatsapp(chosenPath)}
        autoComplete="tel"
      />
      <Field id="c-insta" label={t("contact.instagram")} value={contact.instagram} onChange={(v) => set("instagram", v)} />

      <label className="check">
        <input type="checkbox" checked={contact.consentShare} onChange={(e) => set("consentShare", e.target.checked)} />
        <span>{t("contact.consentShare")}</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={contact.consentEmail} onChange={(e) => set("consentEmail", e.target.checked)} />
        <span>{t("contact.consentEmail")}</span>
      </label>

      {error && (
        <p role="alert" className="card border-l-4 !border-l-attention px-4 py-3">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={sending}>
        {sending ? t("contact.sending") : t("contact.share")}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------ 8 · Confirmation ----- */

export function Confirmation({
  headingRef,
  result,
  personal,
  onBack,
  printButtons,
}: {
  headingRef: HeadingRef;
  result: MapResult;
  personal: Personal;
  onBack: () => void;
  printButtons: React.ReactNode;
}) {
  const t = useTranslations();
  const path = result.chosen_path;
  const message = path === "community" ? "confirm.community" : path ? "confirm.personal" : "confirm.none";
  const whatsappLink = RE_WHATSAPP
    ? `https://wa.me/${RE_WHATSAPP}?text=${encodeURIComponent(t("confirm.whatsappText", { name: personal.name || "" }).trim())}`
    : null;

  return (
    <section className="flex flex-1 flex-col gap-6 pt-2">
      <h1 ref={headingRef} tabIndex={-1} className="t-title outline-none">
        {t("confirm.title")}
      </h1>
      <p className="text-lg">{t(message)}</p>

      <div className="rounded-[12px] bg-rose-100 px-4 py-4">
        <h2 className="t-label">{t("confirm.practiceTitle")}</h2>
        <p className="mt-2">{t(`practice.${result.focus_pillar}`)}</p>
      </div>

      <div className="no-print flex flex-col items-center gap-3 md:items-start">
        {printButtons}
        {whatsappLink && (
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-11 items-center">
            {t("confirm.whatsapp")}
          </a>
        )}
        <button type="button" className="link inline-flex min-h-11 items-center" onClick={onBack}>
          <span aria-hidden="true">←&nbsp;</span>
          {t("confirm.back")}
        </button>
      </div>
    </section>
  );
}
