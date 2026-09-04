import type { Metadata } from "next";
import RelicDetail from "./RelicDetail";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { fetchEntityStats } from "@/lib/entity-stats";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
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

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

/** The /beta rewrites inject ?channel=beta; forward it to the API. */
async function channelQS(searchParams: Props["searchParams"]): Promise<string> {
  const channel = (await searchParams)?.channel;
  return channel === "beta" ? "&channel=beta" : "";
}

/**
 * Shared with app/[lang]/relics/[id]/page.tsx, which re-exports this
 * directly, so relic metadata logic exists in exactly one place.
 * `searchParams.channel` forwards the /beta rewrite's `&channel=beta`.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  try {
    const extraQs = await channelQS(searchParams);
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

export default async function Page({ params, searchParams }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const qs = await channelQS(searchParams);
  let jsonLd = null;
  let relic = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(
      `${API_INTERNAL}/api/relics/${id}${_lang ? `?lang=${_lang}${qs}` : qs ? `?${qs.slice(1)}` : ""}`,
      _lang ? undefined : { next: { revalidate: 3600 } },
    );
    if (res.ok) {
      relic = await res.json();
      const desc = stripTags(relic.description || "");
      const name = relic.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} relic from Slay the Spire 2`,
        path: `${prefix}/relics/${id}`,
        imageUrl: relic.image_url ? imageUrl(relic.image_url) : undefined,
        category: "Relic",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Relics", lang), href: `${prefix}/relics` },
          { name, href: `${prefix}/relics/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `What does ${name} do in Slay the Spire 2?`, answer: desc || `${name} is a relic in Slay the Spire 2.` },
        { question: `How rare is ${name}?`, answer: `${name} is a ${relic.rarity} relic.` },
        { question: `Which characters can find ${name}?`, answer: `${name} belongs to the ${relic.pool} pool.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!relic) redirectMissingEntity("relics", id, _lang);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const initialStats: EntityStats | null = relic ? await fetchEntityStats("relics", id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <RelicDetail initialRelic={relic} initialStats={initialStats} />
    </>
  );
}
