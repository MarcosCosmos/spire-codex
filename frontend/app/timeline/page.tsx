import type { Epoch, Story, Card, Relic, Potion } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import TimelineClient from "./TimelineClient";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/timeline",
    title: t("Timeline", lang),
    description: `${gameName} Timeline. All epochs, eras, and story arcs with cards, relics, and potions unlocked at each step.`,
  });
}

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function TimelinePage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const prefix = _lang ? `/${_lang}` : "";

  let epochs: Epoch[] = [];
  let stories: Story[] = [];
  let cards: Card[] = [];
  let relics: Relic[] = [];
  let potions: Potion[] = [];

  try {
    const [epochsRes, storiesRes, cardsRes, relicsRes, potionsRes] = await Promise.all([
      fetch(`${API}/api/epochs?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/stories?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/cards?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/relics?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/potions?lang=${lang}`, { next: { revalidate: 300 } }),
    ]);
    if (epochsRes.ok) epochs = await epochsRes.json();
    if (storiesRes.ok) stories = await storiesRes.json();
    if (cardsRes.ok) cards = await cardsRes.json();
    if (relicsRes.ok) relics = await relicsRes.json();
    if (potionsRes.ok) potions = await potionsRes.json();
  } catch {}

  // Sort epochs by sort_order for initial render
  epochs.sort((a, b) => a.sort_order - b.sort_order);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Timeline", lang), href: `${prefix}/timeline` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} Timeline`,
      description: `Explore the full ${gameName} timeline across every epoch and story arc.`,
      path: `${prefix}/timeline`,
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {t("Timeline", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("timeline_tagline", lang)}
      </p>

      <TimelineClient
        initialEpochs={epochs}
        initialStories={stories}
        initialCards={cards}
        initialRelics={relics}
        initialPotions={potions}
      />
    </div>
  );
}
