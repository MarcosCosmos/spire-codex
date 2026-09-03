import type { Metadata } from "next";
import RelicDetail from "./RelicDetail";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { fetchEntityStats } from "@/lib/entity-stats";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

// Relic data only changes on deploy. force-static + revalidate
// keeps Next.js from auto-marking the page dynamic just because we
// `await params`, needed for CF edge caching to engage.
export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = {
  params: Promise<{ lang?: string; id: string }>;
  searchParams?: Promise<{ channel?: string }>;
};

/**
 * Shared with app/[lang]/relics/[id]/page.tsx, which re-exports this
 * directly, so relic metadata logic exists in exactly one place.
 * `searchParams.channel` forwards the /beta rewrite's `&channel=beta`.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  if (lang && !isValidLang(lang)) return {};
  try {
    const channel = (await searchParams)?.channel;
    const extraQs = channel === "beta" ? "&channel=beta" : "";
    const qs = lang ? `?lang=${lang}${extraQs}` : extraQs ? `?${extraQs.slice(1)}` : "";
    const res = await fetch(`${API_INTERNAL}/api/relics/${id}${qs}`, lang ? undefined : { next: { revalidate: 3600 } });
    if (!res.ok) return { title: "Relic Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const resolvedLang = getLangOrDefault(lang);
    const gameName = LANG_GAME_NAME[resolvedLang];
    // entity.rarity is already localized by the API. For starter relics the
    // localized rarity phrase already means "Starter Relic" (e.g. Spanish
    // "Reliquia básica"), so appending the relic noun again would double up
    // — only append when the rarity doesn't already include it.
    const rarity: string = entity.rarity || "";
    const relicWord = t("Relic", resolvedLang);
    const titleSuffix = rarity.toLowerCase().includes(relicWord.toLowerCase())
      ? rarity
      : `${rarity} ${relicWord}`;
    const title = `${name} - ${titleSuffix}`;
    const meta = buildPageMetadata({
      lang,
      path: `/relics/${id}`,
      title,
      description: clipMetaDescription(`${gameName} ${rarity} relic, ${name}${desc ? `: ${desc}` : ""}`),
      ogType: "article",
    });
    return {
      ...meta,
      openGraph: {
        ...meta.openGraph,
        images: entity.image_url ? [{ url: imageUrl(entity.image_url) }] : undefined,
      },
    };
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let relic = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/relics/${id}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      relic = await res.json();
      const desc = stripTags(relic.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: relic.name,
        description: desc || `${relic.name} relic from Slay the Spire 2`,
        path: `/relics/${id}`,
        imageUrl: relic.image_url ? imageUrl(relic.image_url) : undefined,
        category: "Relic",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Relics", href: "/relics" },
          { name: relic.name, href: `/relics/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${relic.name} do in Slay the Spire 2?`, answer: desc || `${relic.name} is a relic in Slay the Spire 2.` },
        { question: `How rare is ${relic.name}?`, answer: `${relic.name} is a ${relic.rarity} relic.` },
        { question: `Which characters can find ${relic.name}?`, answer: `${relic.name} belongs to the ${relic.pool} pool.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!relic) redirectMissingEntity("relics", id);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const initialStats: EntityStats | null = relic ? await fetchEntityStats("relics", id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <RelicDetail initialRelic={relic} initialStats={initialStats} />
    </>
  );
}
