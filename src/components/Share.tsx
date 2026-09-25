"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type RefObject } from "react";
import { RE_WHATSAPP } from "@/lib/links";
import { PATHS, type Locale } from "@/lib/i18n";
import { enabled as dbEnabled, shareMap, type ContactDetails } from "@/lib/db";
import type { Personal } from "@/lib/conclusion";
import type { Answers, MapResult, Path } from "@/lib/scoring";

type HeadingRef = RefObject<HTMLHeadingElement | null>;

const emptyContact = (firstName: string): ContactDetails => ({
  firstName,
  email: "",
  whatsapp: "",
  instagram: "",
  consentShare: false,
  consentAnswers: false,
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
  invalid,
  errorId,
}: {
  id: string;
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
  invalid?: boolean;
  errorId?: string;
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
        aria-invalid={invalid || undefined}
        aria-describedby={[hint ? `${id}-hint` : null, invalid ? errorId : null].filter(Boolean).join(" ") || undefined}
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
  answers,
  onShared,
}: {
  mapId: string | null;
  chosenPath: Path | null;
  personal: Personal;
  /** Her 24 answers, which travel with the first consent so Rê can read them with her. */
  answers: Answers;
  onShared: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [contact, setContact] = useState<ContactDetails>(() => emptyContact(personal.name));
  const [error, setError] = useState<{ message: string; field: string | null } | null>(null);
  const [sending, setSending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof ContactDetails>(key: K, value: ContactDetails[K]) =>
    setContact((c) => ({ ...c, [key]: value }));

  // The form appears further down the page when she chooses a card. Moving focus to its
  // heading is how a screen-reader or keyboard user learns that anything happened at all
  // (review 5, finding 21).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  /** One problem at a time, and the cursor goes to the field it is about. */
  function fail(field: string | null, message: string) {
    setError({ message, field });
    if (field) formRef.current?.querySelector<HTMLInputElement>(`#${field}`)?.focus();
    return false;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.email.trim()) return fail("c-email", t("contact.needEmail"));
    if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(contact.email.trim())) return fail("c-email", t("contact.needEmailValid"));
    if (needsWhatsapp(chosenPath) && !contact.whatsapp.trim()) return fail("c-whats", t("contact.needWhatsapp"));
    if (!contact.consentShare) return fail("c-consent", t("contact.needConsent"));
    if (!dbEnabled || !mapId) return fail(null, t("contact.notReady"));

    setError(null);
    setSending(true);
    const ok = await shareMap(mapId, chosenPath, { ...contact, email: contact.email.trim() }, personal, answers);
    setSending(false);
    if (ok) onShared();
    else fail(null, t("contact.failed"));
  }

  const wrong = (field: string) => error?.field === field;
  const complete = answers.length === 24 && answers.every((a) => a !== null);

  return (
    <form ref={formRef} className="card flex flex-col gap-4 px-4 py-4" onSubmit={submit} noValidate>
      <h2 ref={headingRef} tabIndex={-1} className="t-pillar !text-xl outline-none">
        {t("contact.title")}
      </h2>
      <p>{t("contact.lead")}</p>
      <Field id="c-name" label={t("contact.name")} value={contact.firstName} onChange={(v) => set("firstName", v)} autoComplete="given-name" />
      <Field
        id="c-email"
        label={t("contact.email")}
        type="email"
        value={contact.email}
        onChange={(v) => set("email", v)}
        required
        autoComplete="email"
        invalid={wrong("c-email")}
        errorId="c-error"
      />
      <Field
        id="c-whats"
        label={t("contact.whatsapp")}
        hint={t("contact.whatsappHint")}
        type="tel"
        value={contact.whatsapp}
        onChange={(v) => set("whatsapp", v)}
        required={needsWhatsapp(chosenPath)}
        autoComplete="tel"
        invalid={wrong("c-whats")}
        errorId="c-error"
      />
      <Field id="c-insta" label={t("contact.instagram")} value={contact.instagram} onChange={(v) => set("instagram", v)} />

      <label className="check">
        <input
          id="c-consent"
          type="checkbox"
          checked={contact.consentShare}
          aria-invalid={wrong("c-consent") || undefined}
          aria-describedby={wrong("c-consent") ? "c-error" : undefined}
          onChange={(e) => set("consentShare", e.target.checked)}
        />
        <span>{t("contact.consentShare")}</span>
      </label>
      {/* Her 24 answers are health answers beside her name, so they get their own box and
          it is optional — sharing must not be the price of handing them over (review 6,
          finding 1). It only appears when there is a complete set to send, so the words
          never promise something that will not happen. */}
      {complete && (
        <div>
          <label className="check">
            <input
              type="checkbox"
              checked={contact.consentAnswers}
              onChange={(e) => set("consentAnswers", e.target.checked)}
            />
            <span>{t("contact.consentAnswers")}</span>
          </label>
          <p className="t-helper mt-1">{t("contact.consentAnswersHint")}</p>
        </div>
      )}

      <label className="check">
        <input type="checkbox" checked={contact.consentEmail} onChange={(e) => set("consentEmail", e.target.checked)} />
        <span>{t("contact.consentEmail")}</span>
      </label>

      {/* Spec §13: what this means, and the way out, on the form itself. */}
      <p className="t-helper">
        {t("contact.leaving")}{" "}
        <a href={PATHS[locale].privacy} className="link" target="_blank" rel="noopener noreferrer">
          {t("contact.privacyLink")}
        </a>
      </p>

      {error && (
        <p id="c-error" role="alert" className="card border-l-4 !border-l-attention px-4 py-3">
          {error.message}
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
