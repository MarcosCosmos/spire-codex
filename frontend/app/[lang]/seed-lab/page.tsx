import type { Metadata } from "next";
import SeedLabClient from "@/app/seed-lab/SeedLabClient";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string }> };

// noindex, like the base route: this is an internal tool, so it needs no
// canonical or hreflang wiring — only the title is localized.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return {
    title: t("Seed Lab", lang),
    robots: { index: false, follow: false },
  };
}

export default function SeedLabPage() {
  return <SeedLabClient />;
}
