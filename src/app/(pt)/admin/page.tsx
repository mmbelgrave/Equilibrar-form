import type { Metadata } from "next";
import { Admin } from "@/components/Admin";

/** Rê's own page. Search engines are told to stay away; the data is protected by the
 * database's rules, not by the page being hard to find. */
export const metadata: Metadata = { title: "Mapas · Equilibrar", robots: { index: false, follow: false } };

export default function Page() {
  return <Admin />;
}
