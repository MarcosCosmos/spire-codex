import { Suspense } from "react";
import type { GuideSummary } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import GuidesClient from "./GuidesClient";
import Link from "next/link";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_NAMES } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const nativeName = LANG_NAMES[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/guides",
    title: t("Guides", lang),
    description: `${t("guides_tagline", lang)} ${nativeName}.`,
  });
}

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function GuidesPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = _lang ? `/${_lang}` : "";

  let guides: GuideSummary[] = [];
  try {
    const res = await fetch(`${API}/api/guides`, { next: { revalidate: 300 } });
    if (res.ok) guides = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Guides", lang), href: `${prefix}/guides` },
    ]),
    buildCollectionPageJsonLd({
      name: `Slay the Spire 2 ${t("Guides", lang)}`,
      description: t("guides_tagline", lang),
      path: `${prefix}/guides`,
      items: guides.map((g) => ({ name: g.title, path: `${prefix}/guides/${g.slug}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{t("Guides", lang)}</span>
        </h1>
        <Link
          href={`${prefix}/guides/submit`}
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-[var(--accent-gold)] text-black font-semibold text-sm hover:brightness-110 transition-all"
        >
          {t("Submit a Guide", lang)}
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("guides_tagline", lang)}
      </p>

      <Suspense>
        <GuidesClient initialGuides={guides} />
      </Suspense>
    </div>
  );
}
