import { Suspense } from "react";
import type { Metadata } from "next";
import type { Enchantment } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import EnchantmentsClient from "./EnchantmentsClient";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import { buildPageMetadata } from "@/lib/seo";
import {
  getLangOrDefault,
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
} from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY = "enchantments";
const CATEGORY_LABEL = "Enchantments";

type Props = { params: Promise<{ lang?: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];

  const title = _lang ? t(CATEGORY_LABEL, lang) : "Enchantments - Complete Enchantment List";
  const description = _lang
    ? `${gameName} ${t(CATEGORY_LABEL, lang)} (${nativeName}). Every enchantment, effects, card-type restrictions, stackability, and added card text.`
    : "Every Slay the Spire 2 (sts2) enchantment, effects, card-type restrictions, stackability, and the extra card text added to Attack, Skill, and Power cards.";

  return buildPageMetadata({
    lang: _lang,
    path: `/${CATEGORY}`,
    title,
    description,
  });
}

export default async function EnchantmentsPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];

  let enchantments: Enchantment[] = [];
  try {
    const res = await fetch(`${API}/api/${CATEGORY}?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) enchantments = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      ...(_lang ? [{ name: nativeName, href: prefix }] : []),
      { name: CATEGORY_LABEL, href: `${prefix}/${CATEGORY}` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t(CATEGORY_LABEL, lang)}`,
      description: "Browse every enchantment.",
      path: `${prefix}/${CATEGORY}`,
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {t(CATEGORY_LABEL, lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("enchantments_tagline", lang)}
      </p>

      <RecentlyAdded entityType="enchantments" label="Enchantment" pathPrefix={`${prefix}/enchantments`} />

      <Suspense>
        <EnchantmentsClient initialEnchantments={enchantments} />
      </Suspense>
    </div>
  );
}
