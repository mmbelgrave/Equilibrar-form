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
      <p className="t-helper">{t("updated")}</p>
      <p className="text-lg">{t("lead")}</p>

      {/* The order follows what a woman actually wants to know, not the order the law lists
          things in: who has this, on what footing, what stays with me, what leaves, who else
          sees it, for how long, and what I can do about it. Everything article 13 of the
          GDPR and article 9 of the LGPD require is in here; the health answers are what make
          the consent explicit rather than assumed.

          What is true also depends on whether Rê's database is switched on. Saying "nothing
          leaves your device" while a Map is being saved would be consent obtained against a
          description of the opposite behaviour (review 5, finding 1). */}
      <Section t={t} title="whoTitle" body={["who"]} />
      <Section t={t} title="basisTitle" body={["basis"]} />
      <Section t={t} title="deviceTitle" body={["p1", "p2"]} />
      <Section t={t} title="savedTitle" body={dbEnabled ? ["p1Saving"] : ["p1Local"]} />
      {dbEnabled && <Section t={t} title="shareTitle" body={["p6Share"]} />}
      <Section
        t={t}
        title="helpersTitle"
        body={dbEnabled ? ["helpers", "helperDb", "helperMail", "helperBooking", "transfers", "noTrackers"] : ["noTrackers"]}
      />
      <Section
        t={t}
        title="keepTitle"
        body={dbEnabled ? ["keepUnfinished", "keepFinished", "keepShared", "keepDevice"] : ["keepDevice"]}
      />
      <Section t={t} title="rightsTitle" body={["rights", "rightsHow", "rightsComplain"]} />
      <Section t={t} title="decideTitle" body={["decide"]} />
      <Section t={t} title="ageTitle" body={["p5"]} />
      <Section t={t} title="changesTitle" body={["changes"]} />
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

/** One headed part of the notice. `t` is the privacy namespace, `body` its paragraph keys. */
function Section({
  t,
  title,
  body,
}: {
  t: (key: string) => string;
  title: string;
  body: readonly string[];
}) {
  return (
    <section className="flex flex-col gap-3 pt-2">
      <h2 className="t-pillar">{t(title)}</h2>
      {body.map((k) => (
        <p key={k}>{t(k)}</p>
      ))}
    </section>
  );
}
