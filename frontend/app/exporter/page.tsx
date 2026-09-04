import type { Metadata } from "next";
import ExporterBody from "./ExporterBody";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_NAMES } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];

  const title = t("Art Exporter", lang);
  const description = _lang
    ? `The tool that generates every image on Spire Codex, free on the Steam Workshop for ${gameName}. Card renders, Spine character art, animations, and texture dumps. ${nativeName}.`
    : "The Spire Codex Art Exporter for Slay the Spire 2 (sts2), free on the Steam Workshop. It renders card art at every upgrade level, characters and monsters, animations, backgrounds, and full texture dumps straight from the running game.";

  return buildPageMetadata({
    lang: _lang,
    path: "/exporter",
    title,
    description,
  });
}

export default async function ExporterPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return <ExporterBody lang={lang} />;
}
