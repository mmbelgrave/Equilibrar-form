import { FONT_CLASSES } from "@/lib/fonts";
import { STATE_KEY } from "@/lib/storage";

// Runs before first paint: if this browser holds progress past the welcome screen,
// show "loading your answers" instead of flashing the welcome (see globals.css).
const RESUME_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(STATE_KEY)}));if(s&&s.v===2&&s.screen&&s.screen!=="welcome")document.documentElement.setAttribute("data-resume","1")}catch(e){}`;

export function RootShell({ lang, children }: { lang: string; children: React.ReactNode }) {
  return (
    <html lang={lang} className={FONT_CLASSES} suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-head-element -- App Router root layout; the script must run before first paint */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: RESUME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
