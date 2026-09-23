import type { Metadata } from "next";
import { Privacy } from "@/components/Privacy";
import { FLAT_MESSAGES } from "@/lib/i18n";

export const metadata: Metadata = { title: `${FLAT_MESSAGES.pt["privacy.title"]} · ${FLAT_MESSAGES.pt["meta.title"]}` };

export default function Page() {
  return <Privacy locale="pt" />;
}
