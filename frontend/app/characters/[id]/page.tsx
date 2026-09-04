import type { Metadata } from "next";
import CharacterDetail from "./CharacterDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

import { imageUrl } from "@/lib/image-url";

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
    const res = await fetch(`${API_INTERNAL}/api/characters/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (!res.ok) return { title: "Character Not Found" };
    const char = await res.json();
    const desc = stripTagsFlat(char.description || "");
    const name = char.name || char.title || id;
    const gameName = LANG_GAME_NAME[lang];
    const title = `${name} - ${t("Character", lang)}`;
    const stats = char.starting_hp ? `${char.starting_hp} HP, ${char.max_energy} Energy.` : "";
    const metaDesc = clipMetaDescription(
      `${gameName} playable character, ${name}.${stats ? ` ${stats}` : ""}${desc ? ` ${desc}` : ""}`,
    );
    return buildPageMetadata({
      lang: _lang,
      path: `/characters/${id}`,
      title,
      description: metaDesc,
      ogType: "article",
    });
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  let jsonLd = null;
  let char = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/characters/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (res.ok) {
      char = await res.json();
      const desc = stripTags(char.description || "");
      const name = char.name || char.title || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} from Slay the Spire 2`,
        path: `${prefix}/characters/${id}`,
        imageUrl: imageUrl(`/static/images/characters/combat_${char.id.toLowerCase()}.webp`),
        category: "Character",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Characters", lang), href: `${prefix}/characters` },
          { name, href: `${prefix}/characters/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `How do you play ${name} in Slay the Spire 2?`, answer: desc || `${name} is a playable character in Slay the Spire 2.` },
        { question: `What is ${name}'s starting HP in Slay the Spire 2?`, answer: char.starting_hp ? `${name} starts with ${char.starting_hp} HP.` : `${name}'s HP information is available on the character page.` },
        { question: `What type of deck does ${name} use?`, answer: char.deck?.length ? `${name} starts with ${char.deck.length} cards in their starting deck.` : `${name} uses a unique card pool.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!char) redirectMissingEntity("characters", id, _lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CharacterDetail initialCharacter={char} />
    </>
  );
}
