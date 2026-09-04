import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_NAMES } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import PrivacyBody from "./PrivacyBody";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const nativeName = LANG_NAMES[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/privacy",
    title: t("Privacy Policy", lang),
    description: `${t("How Spire Codex collects, uses, and retains data submitted through the website, API, and Overwolf overlay.", lang)} ${nativeName}.`,
  });
}

export default async function PrivacyPage({ params }: Props) {
  const { lang } = await params;
  return <PrivacyBody lang={getLangOrDefault(lang)} />;
}
