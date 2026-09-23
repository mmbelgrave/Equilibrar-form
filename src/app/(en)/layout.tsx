import type { Metadata, Viewport } from "next";
import { RootShell } from "@/components/RootShell";
import { FLAT_MESSAGES, PATHS } from "@/lib/i18n";
import "../globals.css";

export const metadata: Metadata = {
  title: FLAT_MESSAGES.en["meta.title"],
  description: FLAT_MESSAGES.en["meta.description"],
  alternates: { languages: { "pt-BR": PATHS.pt.map, en: PATHS.en.map } },
};

export const viewport: Viewport = { themeColor: "#cfa1a6", width: "device-width", initialScale: 1 };

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="en">{children}</RootShell>;
}
