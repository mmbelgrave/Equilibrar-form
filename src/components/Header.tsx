"use client";

import { useTranslations } from "next-intl";
import { asset, type Locale } from "@/lib/i18n";
import { saveLocale } from "@/lib/storage";

type Props = {
  locale: Locale;
  /** Where each language lives for the current page. */
  hrefs: Record<Locale, string>;
  onSwitch?: (locale: Locale) => void;
  /** "full": the logo lockup (welcome, result). "compact": lotus + wordmark (questions). */
  variant?: "full" | "compact";
};

/**
 * The title band: Renata's logo on its own rose (the image background is rose-500
 * exactly, so it sits seamlessly). The PT / EN toggle is text, never flags (§11).
 */
export function Header({ locale, hrefs, onSwitch, variant = "compact" }: Props) {
  const t = useTranslations();
  return (
    <header className="band">
      <div className="mx-auto w-full max-w-[600px] px-5">
        <div className={"flex justify-between gap-3 " + (variant === "full" ? "items-start pt-2" : "items-center py-2")}>
          {variant === "compact" ? (
            <div className="flex min-w-0 items-center gap-2.5" role="img" aria-label={t("brand.alt")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny static PNG, no optimiser needed */}
              <img src={asset("/brand/lotus.png")} alt="" width={28} height={32} className="h-8 w-7 flex-none" />
              <span className="t-wordmark truncate" aria-hidden="true">
                {t("brand.wordmark")}
              </span>
            </div>
          ) : (
            <span />
          )}
          <LanguageToggle locale={locale} hrefs={hrefs} onSwitch={onSwitch} />
        </div>
        {variant === "full" && (
          <div className="flex justify-center pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- two pre-sized PNGs via srcSet */}
            <img
              src={asset("/brand/logo-lockup-sm.png")}
              srcSet={`${asset("/brand/logo-lockup-sm.png")} 560w, ${asset("/brand/logo-lockup.png")} 1120w`}
              sizes="(min-width: 600px) 400px, calc(100vw - 72px)"
              width={560}
              height={167}
              alt={t("brand.alt")}
              className="h-auto w-full max-w-[400px]"
              fetchPriority="high"
            />
          </div>
        )}
      </div>
    </header>
  );
}

function LanguageToggle({ locale, hrefs, onSwitch }: Pick<Props, "locale" | "hrefs" | "onSwitch">) {
  const t = useTranslations();
  return (
    <nav aria-label={t("lang.label")} className="no-print flex flex-none items-center text-sm font-bold text-ink">
      {(["pt", "en"] as const).map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && <span aria-hidden="true">/</span>}
          <a
            href={hrefs[l]}
            lang={l === "pt" ? "pt-BR" : "en"}
            hrefLang={l === "pt" ? "pt-BR" : "en"}
            aria-current={l === locale ? "true" : undefined}
            className={
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 " +
              (l === locale ? "underline decoration-2 underline-offset-4" : "font-normal hover:underline")
            }
            onClick={(e) => {
              saveLocale(l); // remembered for "/" on every page, including the privacy notice
              if (!onSwitch) return;
              e.preventDefault();
              if (l !== locale) onSwitch(l);
            }}
          >
            {l.toUpperCase()}
          </a>
        </span>
      ))}
    </nav>
  );
}
