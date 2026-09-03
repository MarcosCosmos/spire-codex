import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import SharedRunClient from "@/app/runs/[hash]/SharedRunClient";
import {
  getLangOrDefault,
  LANG_GAME_NAME,
  LANG_HREFLANG,
  LangCode,
} from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; hash: string }> };

interface SharedRun {
  run_time?: number;
  primary_hash?: string;
  win?: boolean;
  was_abandoned?: boolean;
  username?: string | null;
  ascension?: number;
  players?: { character?: string; deck?: unknown[]; relics?: unknown[] }[];
}

async function fetchRun(hash: string): Promise<SharedRun | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/shared/${hash}`);
    if (!res.ok) return null;
    return (await res.json()) as SharedRun;
  } catch {
    return null;
  }
}

function describeRun(run: SharedRun, lang: LangCode) {
  const rawChar =
    run.players?.[0]?.character?.replace("CHARACTER.", "") || "Unknown";
  const char = t(rawChar.charAt(0) + rawChar.slice(1).toLowerCase(), lang);
  const result = t(
    run.win ? "win" : run.was_abandoned ? "abandoned" : "loss",
    lang,
  );
  const username = run.username?.trim() || "Anonymous";
  const ascension = run.ascension ?? 0;
  return { char, result, username, ascension };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang, hash } = await params;
  const lang = getLangOrDefault(_lang);
  const run = await fetchRun(hash);
  if (!run) {
    const pageName = t("Run not found", lang);
    return { title: pageName + " - Slay the Spire 2 (sts2) | Spire Codex" };
  }

  const { char, result, username, ascension } = describeRun(run, lang);
  const tranlatedAcension = t("Acension", lang);
  const translatedCards = t("cards", lang);
  const translatedRelics = t("relics", lang);
  // Title format requested by user:
  //   "{username} - {character} - Ascension N win/loss - Slay the Spire 2 (sts2) | Spire Codex"
  // Anonymous runs need a discriminator: two anonymous wins with the same
  // character and ascension otherwise share one title, and crawlers flag
  // the collision. Duration alone wasn't enough (two anon Ironclad wins
  // collided at the same minute — co-op siblings share the exact duration),
  // so the page's own share hash rides along: it's the only component
  // guaranteed unique per URL.
  const mins = Math.round((run.run_time ?? 0) / 60);
  const anonTag =
    username === "Anonymous"
      ? `${mins > 0 ? ` in ${mins}m` : ""} #${hash.slice(0, 8)}`
      : "";
  const title = `${username} - ${char} - ${tranlatedAcension} ${ascension} ${result}${anonTag} - Slay the Spire 2 (sts2) | Spire Codex`;
  const description = `${username}'s ${run.win ? t("victorious", lang) : result} ${char} run at ${tranlatedAcension} ${ascension}. ${run.players?.[0]?.deck?.length || 0} ${translatedCards}, ${run.players?.[0]?.relics?.length || 0} ${translatedRelics}.`;
  return {
    title,
    description,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      url: `${SITE_URL}/runs/${hash}`,
      title,
      description,
      locale: LANG_HREFLANG[lang],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    // No hreflang alternates: a run-share page is inherently English
    // game data (the same hash points at the same numbers regardless of
    // locale chrome), so localized variants /<lang>/runs/<hash> read to
    // Google as near-duplicates of the canonical /runs/<hash>. That was
    // generating ~5,000 "Duplicate without user-selected canonical"
    // pages in GSC.
    // Co-op sibling pages (one share hash per player, identical content)
    // canonical to the player-0 hash the API reports, so crawlers stop
    // counting each seat as a duplicate page.
    alternates: { canonical: `/runs/${run.primary_hash || hash}` },
  };
}

export default async function SharedRunPage({ params }: Props) {
  const { lang: _lang, hash } = await params;
  const lang = getLangOrDefault(_lang);
  const run = await fetchRun(hash);
  let jsonLd: ReturnType<typeof buildDetailPageJsonLd> | null = null;
  if (run) {
    const { char, result, username, ascension } = describeRun(run, lang);
    const tranlatedAcension = t("Acension", lang);
    jsonLd = buildDetailPageJsonLd({
      name: `${username} - ${char} - ${tranlatedAcension} ${ascension} ${result}`,
      description: `${username}'s ${run.win ? t("victorious", lang) : result} ${char} run at ${tranlatedAcension} ${ascension} in ${LANG_GAME_NAME[lang]}`,
      path: `/runs/${hash}`,
      category: "Run",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Leaderboards", href: "/leaderboards" },
        { name: `${username} - ${char}`, href: `/runs/${hash}` },
      ],
    });
  }
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      {/* The run is passed down so the page server-renders with real
          content; without it every run page was an identical client-side
          shell (duplicate content, no unique text for crawlers). */}
      <SharedRunClient initialRun={run} />
    </>
  );
}
