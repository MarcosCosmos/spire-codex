import type { Metadata } from "next";
import SeedLabClient from "./SeedLabClient";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string }> };

// noindex: this is an internal tool, so it needs no canonical or hreflang
// wiring — only the title is localized.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return buildPageMetadata({
    lang: _lang,
    path: "/seed-lab",
    title: t("Seed Lab", lang),
    offerLanguageAlternatives: false,
    noindex: true,
  });
}

export default function SeedLabPage() {
  return <SeedLabClient />;
}
