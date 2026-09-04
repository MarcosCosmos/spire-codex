import type { Metadata } from "next";
import EnchantmentDetail from "./EnchantmentDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";
import { cardsForEnchantment } from "@/lib/card-enchantments";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  try {
    const res = await fetch(`${API_INTERNAL}/api/enchantments/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Enchantment Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[lang];
    const title = `${name} - ${t("Enchantment", lang)}`;
    const meta = buildPageMetadata({
      lang: _lang,
      path: `/enchantments/${id}`,
      title,
      description: clipMetaDescription(`${gameName} card enchantment, ${name}${desc ? `: ${desc}` : ""}`),
      ogType: "article",
    });
    return { ...meta, openGraph: { ...meta.openGraph, images: entity.image_url ? [{ url: imageUrl(entity.image_url) }] : undefined } };
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const enchantmentCards = cardsForEnchantment(id);
  let jsonLd = null;
  let enchantment = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/enchantments/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (res.ok) {
      enchantment = await res.json();
      const desc = stripTags(enchantment.description || "");
      const name = enchantment.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} enchantment from Slay the Spire 2`,
        path: `${prefix}/enchantments/${id}`,
        imageUrl: enchantment.image_url ? imageUrl(enchantment.image_url) : undefined,
        category: "Enchantment",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Enchantments", lang), href: `${prefix}/enchantments` },
          { name, href: `${prefix}/enchantments/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `What does ${name} do in Slay the Spire 2?`, answer: desc || `${name} is an enchantment in Slay the Spire 2.` },
        { question: `What card type is ${name} for?`, answer: enchantment.applicable_to ? `${name} can be applied to ${enchantment.applicable_to}.` : enchantment.card_type ? `${name} can be applied to ${enchantment.card_type} cards.` : `${name} can be applied to any card type.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!enchantment)
    redirectMissingEntity("enchantments", id, _lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EnchantmentDetail
        initialEnchantment={enchantment}
        cardIds={enchantmentCards.cardIds}
        totalCards={enchantmentCards.total}
      />
    </>
  );
}
