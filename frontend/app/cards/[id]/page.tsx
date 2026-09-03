import type { Metadata } from "next";
import CardDetail from "./CardDetail";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { fetchEntityStats } from "@/lib/entity-stats";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, isValidLang } from "@/lib/languages";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { cardOgImages } from "@/lib/image-url";
import { enchantmentsForCard } from "@/lib/card-enchantments";

// 1h on-demand ISR. force-static + revalidate forces Next.js to
// cache even with async-params pages, without it, Next 15+ sees
// `await params` and marks the page dynamic, emitting
// `Cache-Control: no-store` which makes CF refuse to cache.
// dynamicParams=true (default) means any [id] is generated on demand
// then cached for the revalidate window.
export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = {
  params: Promise<{ lang?: string; id: string }>;
  searchParams?: Promise<{ channel?: string }>;
};

/**
 * Shared with app/[lang]/cards/[id]/page.tsx, which re-exports this
 * directly, so card metadata logic exists in exactly one place.
 * `searchParams.channel` forwards the /beta rewrite's `&channel=beta`.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  if (lang && !isValidLang(lang)) return {};
  try {
    const channel = (await searchParams)?.channel;
    const extraQs = channel === "beta" ? "&channel=beta" : "";
    const qs = lang ? `?lang=${lang}${extraQs}` : extraQs ? `?${extraQs.slice(1)}` : "";
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}${qs}`, lang ? undefined : { next: { revalidate: 3600 } });
    if (!res.ok) return { title: "Card Not Found" };
    const card = await res.json();
    const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
    const color = (card.color || "").replace(/^\w/, (c: string) => c.toUpperCase());
    // card.rarity / card.type already come back localized from the API.
    const title = `${card.name} - ${card.rarity} ${card.type}`;
    const descFlat = stripTagsFlat(card.description || "");
    const keywords = card.keywords?.length ? ` Keywords: ${card.keywords.join(", ")}.` : "";
    const metaDesc = clipMetaDescription(
      `${gameName}, ${card.name} (${card.cost ?? "X"}-cost ${card.rarity} ${card.type}, ${color}). ${descFlat}${keywords}`,
    );
    // Full game-rendered card (base + upgraded) as the share image, in this language.
    const ogImages = cardOgImages(card, lang ?? "eng");
    const meta = buildPageMetadata({
      lang,
      path: `/cards/${id}`,
      title,
      description: metaDesc,
      ogType: "article",
    });
    return { ...meta, openGraph: { ...meta.openGraph, images: ogImages } };
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let card = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/cards/${id}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      card = await res.json();
      const desc = stripTags(card.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: card.name,
        description: desc || `${card.name} card from Slay the Spire 2`,
        path: `/cards/${id}`,
        imageUrl: cardOgImages(card, "eng")[0]?.url,
        category: "Card",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Cards", href: "/cards" },
          { name: card.name, href: `/cards/${id}` },
        ],
      });
      const costText = card.is_x_cost ? "X energy" : card.is_x_star_cost ? "X stars" : card.star_cost ? `${card.star_cost} star(s)` : `${card.cost} energy`;
      const faqQuestions = [
        { question: `What does ${card.name} do in Slay the Spire 2?`, answer: desc || `${card.name} is a card in Slay the Spire 2.` },
        { question: `How much does ${card.name} cost?`, answer: `${card.name} costs ${costText}.` },
        { question: `What type of card is ${card.name}?`, answer: `${card.name} is a ${card.rarity} ${card.type} card for ${card.color}.` },
      ];
      if (card.keywords?.length) {
        faqQuestions.push({ question: `Does ${card.name} have any keywords?`, answer: `Yes, ${card.name} has: ${card.keywords.join(", ")}.` });
      }
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    // Network / DNS / backend-down. Don't redirect blindly here, if
    // the backend is offline we'd send every detail page request into
    // a 308 storm at the hub. Fall through to render the client
    // component, which has its own retry-on-mount + Not Found UI.
    apiUnreachable = true;
  }
  // 308 unknown IDs to the cards list so search engines transfer
  // link equity and humans land on something useful.
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!card) redirectMissingEntity("cards", id);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const initialStats: EntityStats | null = card ? await fetchEntityStats("cards", id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CardDetail
        initialCard={card}
        initialEnchantments={enchantmentsForCard(id)}
        initialStats={initialStats}
      />
    </>
  );
}
