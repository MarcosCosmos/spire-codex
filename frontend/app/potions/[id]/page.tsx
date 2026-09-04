import type { Metadata } from "next";
import PotionDetail from "./PotionDetail";
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

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/potions/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Potion Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const resolvedLang = getLangOrDefault(lang);
    const gameName = LANG_GAME_NAME[resolvedLang];
    // entity.rarity is already localized by the API.
    const rarity: string = entity.rarity || "";
    const potionWord = t("Potion", resolvedLang);
    const titleSuffix = rarity.toLowerCase().includes(potionWord.toLowerCase())
      ? rarity
      : `${rarity} ${potionWord}`;
    const title = `${name} - ${titleSuffix}`;
    const meta = buildPageMetadata({
      lang,
      path: `/potions/${id}`,
      title,
      description: clipMetaDescription(`${gameName} ${rarity} potion, ${name}${desc ? `: ${desc}` : ""}`),
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
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  let jsonLd = null;
  let potion = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/potions/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (res.ok) {
      potion = await res.json();
      const desc = stripTags(potion.description || "");
      const name = potion.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} potion from Slay the Spire 2`,
        path: `${prefix}/potions/${id}`,
        imageUrl: potion.image_url ? imageUrl(potion.image_url) : undefined,
        category: "Potion",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Potions", lang), href: `${prefix}/potions` },
          { name, href: `${prefix}/potions/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `What does ${name} do in Slay the Spire 2?`, answer: desc || `${name} is a potion in Slay the Spire 2.` },
        { question: `How rare is ${name}?`, answer: `${name} is a ${potion.rarity} potion.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!potion) redirectMissingEntity("potions", id, _lang);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const initialStats: EntityStats | null = potion ? await fetchEntityStats("potions", id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PotionDetail initialPotion={potion} initialStats={initialStats} />
    </>
  );
}
