import type { Metadata } from "next";
import { Suspense } from "react";
import { buildPageMetadata } from "@/lib/seo";
import { isValidLang } from "@/lib/languages";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import ChartsClient from "./ChartsClient";

type Props = { params: Promise<{ lang?: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return buildPageMetadata({
    lang,
    path: "/charts",
    title: "Run Charts",
    description:
      "Interactive charts over community-submitted Slay the Spire 2 runs: win rate by floor, ascension and over time, damage per encounter, run stat distributions and scatters. Filter by player count, ascension, game mode, or a single player.",
  });
}

export default async function ChartsPage({ params }: Props) {
  const { lang } = await params;
  const prefix = langPrefix(lang);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: prefix || "/" },
      { name: "Charts", href: `${prefix}/charts` },
    ]),
  ];
  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Run Charts</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Interactive aggregates over community-submitted runs. Pick a chart, slice by player
        count, ascension, game mode, or a single player. Aggregation happens server-side, so
        every view is a single small request.
      </p>
      <Suspense fallback={<div className="text-sm text-[var(--text-muted)]">Loading…</div>}>
        <ChartsClient />
      </Suspense>
    </div>
  );
}
