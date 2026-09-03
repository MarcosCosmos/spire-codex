import type { Metadata } from "next";
import EnchantmentDetail from "./EnchantmentDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import { getLangOrDefault, LANG_GAME_NAME, isValidLang } from "@/lib/languages";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";
import { cardsForEnchantment } from "@/lib/card-enchantments";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  if (lang && !isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/enchantments/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Enchantment Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
    const title = `${name} - ${t("Enchantment", lang ?? "eng")}`;
    const meta = buildPageMetadata({
      lang,
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
  const { id } = await params;
  const enchantmentCards = cardsForEnchantment(id);
  let jsonLd = null;
  let enchantment = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/enchantments/${id}`);
    if (res.ok) {
      enchantment = await res.json();
      const desc = stripTags(enchantment.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: enchantment.name,
        description: desc || `${enchantment.name} enchantment from Slay the Spire 2`,
        path: `/enchantments/${id}`,
        imageUrl: enchantment.image_url ? imageUrl(enchantment.image_url) : undefined,
        category: "Enchantment",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Enchantments", href: "/enchantments" },
          { name: enchantment.name, href: `/enchantments/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${enchantment.name} do in Slay the Spire 2?`, answer: desc || `${enchantment.name} is an enchantment in Slay the Spire 2.` },
        { question: `What card type is ${enchantment.name} for?`, answer: enchantment.applicable_to ? `${enchantment.name} can be applied to ${enchantment.applicable_to}.` : enchantment.card_type ? `${enchantment.name} can be applied to ${enchantment.card_type} cards.` : `${enchantment.name} can be applied to any card type.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!enchantment)
    redirectMissingEntity("enchantments", id);
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
