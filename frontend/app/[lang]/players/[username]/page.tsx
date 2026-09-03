import type { Metadata } from "next";
import PlayerProfileClient from "@/app/players/[username]/PlayerProfileClient";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { getLangOrDefault, LANG_HREFLANG } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string; username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang, username } = await params;
  const lang = getLangOrDefault(_lang);
  const name = decodeURIComponent(username);
  const title = `${name} - ${t("Player Profile", lang)} | Spire Codex`;
  const description = `${name}${t("player_profile_description", lang)}`;
  return {
    title,
    description,
    openGraph: {
      type: "profile",
      siteName: SITE_NAME,
      url: `${SITE_URL}/players/${username}`,
      title,
      description,
      locale: LANG_HREFLANG[lang],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    // No hreflang alternates: a player profile is the same English run
    // data whatever the locale chrome (same reasoning as /runs/<hash>),
    // so localized variants canonical back to the English profile rather
    // than self-canonicalizing per locale.
    alternates: { canonical: `/players/${username}` },
  };
}

export default async function PlayerPage({ params }: Props) {
  const { username } = await params;
  return <PlayerProfileClient username={decodeURIComponent(username)} />;
}
