import { LocaleRedirect } from "@/components/LocaleRedirect";

/** `/` → the remembered language, else Portuguese (spec §11). */
export default function Home() {
  return <LocaleRedirect />;
}
