import type { Metadata } from "next";
import PlayerProfileClient from "@/app/players/[username]/PlayerProfileClient";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string; username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang, username } = await params;
  const lang = getLangOrDefault(_lang);
  const name = decodeURIComponent(username);
  return buildPageMetadata({
    lang: _lang,
    path: `/players/${username}`,
    title: `${name} - ${t("Player Profile", lang)}`,
    description: `${name}${t("player_profile_description", lang)}`,
    ogType: "profile",
    // A profile aggregates the same English run data whatever the locale
    // chrome, same reasoning as /runs/<hash>. Canonical folds back to
    // English and the [lang] variant is noindexed rather than
    // un-routable. Drop both once the chrome is genuinely localized.
    offerLanguageAlternatives: false,
    noindex: Boolean(_lang),
  });
}

export default async function PlayerPage({ params }: Props) {
  const { username } = await params;
  return <PlayerProfileClient username={decodeURIComponent(username)} />;
}
