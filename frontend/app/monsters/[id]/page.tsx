import type { Metadata } from "next";
import MonsterDetail from "./MonsterDetail";
import { fetchEncounterStats } from "@/lib/encounter-stats";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import { imageUrl } from "@/lib/image-url";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

/**
 * type is one of NORMAL / ELITE / BOSS from the API and is not localized.
 * "Normal" reads as a strange noun on its own in a title ("Cultist -
 * Normal"), so it's shown as "Enemy" instead; Elite/Boss are shown as-is.
 */
function monsterTypeWord(type: string, lang: string): string {
  return t(type === "NORMAL" || type === "Normal" ? "Enemy" : type, lang);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}${lang ? `?lang=${lang}` : ""}`, lang ? undefined : { next: { revalidate: 3600 } });
    if (!res.ok) return { title: "Monster Not Found" };
    const entity = await res.json();
    const name = entity.name || id;
    const resolvedLang = getLangOrDefault(lang);
    const gameName = LANG_GAME_NAME[resolvedLang];
    const typeWord = monsterTypeWord(entity.type, resolvedLang);
    const title = `${name} - ${typeWord}`;
    const hpText = entity.min_hp ? `${entity.min_hp}${entity.max_hp && entity.max_hp !== entity.min_hp ? `–${entity.max_hp}` : ""} HP` : "";
    const movesText = entity.moves?.length ? `${entity.moves.length} known moves.` : "";
    const meta = buildPageMetadata({
      lang,
      path: `/monsters/${id}`,
      title,
      description: clipMetaDescription(
        `${gameName} ${typeWord}, ${name}.${hpText ? ` ${hpText}.` : ""}${movesText ? ` ${movesText}` : ""}`,
      ),
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
  let monster = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(
      `${API_INTERNAL}/api/monsters/${id}${_lang ? `?lang=${_lang}` : ""}`,
      _lang ? undefined : { next: { revalidate: 3600 } },
    );
    if (res.ok) {
      monster = await res.json();
      const hpText = monster.min_hp ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `–${monster.max_hp}` : ""} HP` : "";
      const desc = `${monster.type} monster${hpText ? ` · ${hpText}` : ""}`;
      const detailJsonLd = buildDetailPageJsonLd({
        name: monster.name,
        description: desc,
        path: `${prefix}/monsters/${id}`,
        imageUrl: monster.image_url ? imageUrl(monster.image_url) : undefined,
        category: "Monster",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Monsters", lang), href: `${prefix}/monsters` },
          { name: monster.name, href: `${prefix}/monsters/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `How much HP does ${monster.name} have in Slay the Spire 2?`, answer: hpText || `${monster.name}'s HP varies.` },
        { question: `What type of enemy is ${monster.name}?`, answer: `${monster.name} is a ${monster.type} type monster.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!monster) redirectMissingEntity("monsters", id, _lang);
  // Server-render the community "how deadly" stats for this monster's fights.
  const encounterStats = monster?.encounters?.length
    ? await fetchEncounterStats(
        monster.encounters.map((e: { encounter_id: string }) => e.encounter_id),
      )
    : [];
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <MonsterDetail initialMonster={monster} encounterStats={encounterStats} />
    </>
  );
}
