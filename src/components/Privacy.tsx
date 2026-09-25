"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";
import { useState } from "react";
import { Header } from "@/components/Header";
import { enabled as dbEnabled } from "@/lib/db";
import { MESSAGES, PATHS, type Locale } from "@/lib/i18n";
import { clearEverything } from "@/lib/storage";

/** Privacy notice (spec §13). DRAFT wording — for the lawyer, not final. */
export function Privacy({ locale }: { locale: Locale }) {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Lisbon">
      <Header locale={locale} hrefs={{ pt: PATHS.pt.privacy, en: PATHS.en.privacy }} />
      <div className="mx-auto flex w-full max-w-[600px] flex-col px-5">
        <PrivacyBody locale={locale} />
      </div>
    </NextIntlClientProvider>
  );
}

function PrivacyBody({ locale }: { locale: Locale }) {
  const t = useTranslations("privacy");
  const [deleted, setDeleted] = useState(false);
  return (
    <main className="flex flex-col gap-4 pb-12 pt-6">
      <h1 className="t-title">{t("title")}</h1>
      <p className="t-label">{t("draft")}</p>
      {/* What is true depends on whether Rê's database is switched on. Saying "nothing
          leaves your device" while a Map is being saved would be consent obtained against a
          description of the opposite behaviour (review 5, finding 1). */}
      {(dbEnabled
        ? (["p1", "p1Saving", "p6Share", "p2", "p3", "p7Keep", "p4", "p5"] as const)
        : (["p1", "p1Local", "p2", "p3", "p4", "p5"] as const)
      ).map((k) => (
        <p key={k}>{t(k)}</p>
      ))}
      <div className="flex flex-col items-center gap-3 pt-4 md:items-start">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            clearEverything();
            setDeleted(true);
          }}
        >
          {t("delete")}
        </button>
        <p role="status" className="t-helper">
          {deleted ? t("deleted") : ""}
        </p>
        <a href={PATHS[locale].map} className="link inline-flex min-h-11 items-center">
          <span aria-hidden="true">←&nbsp;</span>
          {t("back")}
        </a>
      </div>
    </main>
  );
}
