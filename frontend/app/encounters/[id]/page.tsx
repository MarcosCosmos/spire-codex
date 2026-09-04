import type { Metadata } from "next";
import EncounterDetail from "./EncounterDetail";
import { stripTags, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { fetchEncounterStats } from "@/lib/encounter-stats";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Encounter Not Found" };
    const entity = await res.json();
    const name = entity.name || id;
    const resolvedLang = getLangOrDefault(lang);
    const gameName = LANG_GAME_NAME[resolvedLang];
    // entity.room_type is not localized by the API.
    const roomType = entity.room_type ? t(entity.room_type, resolvedLang) : "";
    const encounterWord = t("Encounter", resolvedLang);
    const title = `${name} - ${roomType} ${encounterWord}`.replace(/\s+/g, " ").trim();
    const monsterList = entity.monsters?.length
      ? ` ${entity.monsters.map((m: { name: string }) => m.name).join(", ")}.`
      : "";
    const actText = entity.act ? ` (${entity.act})` : "";
    const meta = buildPageMetadata({
      lang,
      path: `/encounters/${id}`,
      title,
      description: clipMetaDescription(
        `${gameName} ${roomType} ${encounterWord}, ${name}${actText}.${monsterList}`,
      ),
      ogType: "article",
    });
    return meta;
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  let jsonLd = null;
  let encounter = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/encounters/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (res.ok) {
      encounter = await res.json();
      const name = encounter.name || id;
      const desc = encounter.monsters?.length
        ? `${name} is a ${encounter.room_type} encounter featuring ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.`
        : `${name} encounter from Slay the Spire 2`;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc,
        path: `${prefix}/encounters/${id}`,
        category: "Encounter",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Encounters", lang), href: `${prefix}/encounters` },
          { name, href: `${prefix}/encounters/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `What type of encounter is ${name} in Slay the Spire 2?`, answer: `${name} is a ${encounter.room_type} encounter${encounter.act ? ` found in ${encounter.act}` : ""}.` },
        { question: `What monsters appear in ${name}?`, answer: encounter.monsters?.length ? `${name} features: ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.` : `${name} has no listed monsters.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!encounter) redirectMissingEntity("encounters", id, _lang);
  // Community "how deadly" numbers for this fight (encountered / killed), SSR'd.
  const stats = encounter?.id ? await fetchEncounterStats([encounter.id]) : [];
  const encounterStat = stats[0] ?? null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EncounterDetail initialEncounter={encounter} encounterStat={encounterStat} />
    </>
  );
}
