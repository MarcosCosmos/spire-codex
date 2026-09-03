import type { Metadata } from "next";
import CardDetail from "@/app/cards/[id]/CardDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { cardOgImages } from "@/lib/image-url";
import { enchantmentsForCard } from "@/lib/card-enchantments";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ channel?: string }> };

/** The /beta rewrites inject ?channel=beta; forward it to the API. */
async function channelQS(searchParams: Props["searchParams"]): Promise<string> {
  const { channel } = await searchParams;
  return channel === "beta" ? "&channel=beta" : "";
}

export { generateMetadata } from "@/app/cards/[id]/page";

export default async function Page({ params, searchParams }: Props) {
  const { lang, id } = await params;
  const qs = await channelQS(searchParams);
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let card = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/cards/${id}?lang=${lang}${qs}`);
    if (res.ok) {
      card = await res.json();
      const desc = stripTags(card.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: card.name, description: desc || card.name, path: `/${lang}/cards/${id}`,
        imageUrl: cardOgImages(card, lang)[0]?.url, category: "Card",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Cards", href: `/${lang}/cards` }, { name: card.name, href: `/${lang}/cards/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      const costText = card.is_x_cost ? "X" : card.star_cost ? `${card.star_cost}★` : `${card.cost}`;
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What does ${card.name} do in Slay the Spire 2?`, answer: desc || card.name },
        { question: `How much does ${card.name} cost?`, answer: `${card.name} costs ${costText} energy.` },
        { question: `What type of card is ${card.name}?`, answer: `${card.name} is a ${card.rarity} ${card.type} card for ${card.color}.` },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!card) redirectMissingEntity("cards", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CardDetail initialCard={card} initialEnchantments={enchantmentsForCard(id)} />
    </>
  );
}
