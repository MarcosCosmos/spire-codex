import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_NAMES } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import TermsBody from "./TermsBody";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const nativeName = LANG_NAMES[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/terms",
    title: t("Terms of Service", lang),
    description: `${t("Terms governing use of the Spire Codex website, API, embeddable widgets, and Overwolf overlay.", lang)} ${nativeName}.`,
  });
}

export default async function TermsPage({ params }: Props) {
  const { lang } = await params;
  return <TermsBody lang={getLangOrDefault(lang)} />;
}
