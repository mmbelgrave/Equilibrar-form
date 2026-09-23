"use client";

import { useEffect } from "react";
import { FLAT_MESSAGES, PATHS, asset } from "@/lib/i18n";
import { loadLocale } from "@/lib/storage";

/**
 * `/` has no language of its own. A remembered choice wins; otherwise Portuguese,
 * whatever the browser says — a Brazilian woman on an English-set phone is the likelier
 * visitor, and the Portuguese page offers English visibly (spec §11).
 * While it redirects it shows the live-text lockup: lotus, Poiret One wordmark and the
 * Sacramento "by Rê" — the one place the script face is used (spec §9).
 */
export function LocaleRedirect() {
  useEffect(() => {
    window.location.replace(PATHS[loadLocale() ?? "pt"].map);
  }, []);
  return (
    <main className="band flex flex-1 flex-col items-center justify-center gap-6 px-5 py-16 text-center">
      <div className="flex items-center gap-3" role="img" aria-label={FLAT_MESSAGES.pt["brand.alt"]}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static PNG */}
        <img src={asset("/brand/lotus.png")} alt="" width={42} height={48} />
        <span className="flex flex-col items-start" aria-hidden="true">
          <span className="t-wordmark">{FLAT_MESSAGES.pt["brand.wordmark"]}</span>
          <span className="t-script self-end text-white">{FLAT_MESSAGES.pt["brand.by"]}</span>
        </span>
      </div>
      <p className="flex flex-col gap-2 text-ink">
        <a className="underline underline-offset-4" href={PATHS.pt.map} lang="pt-BR">
          {FLAT_MESSAGES.pt["meta.title"]}
        </a>
        <a className="underline underline-offset-4" href={PATHS.en.map} lang="en">
          {FLAT_MESSAGES.en["meta.title"]}
        </a>
      </p>
    </main>
  );
}
