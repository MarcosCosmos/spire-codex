import type { Metadata } from "next";
import type { Guide } from "@/lib/api";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, stripTagsFlat, clipMetaDescription } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import GuideDetail from "@/app/guides/[slug]/GuideDetail";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { langOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang, slug } = await params;
  const lang = langOrDefault(_lang);
  try {
    const res = await fetch(`${API}/api/guides/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) {
      return { title: `${t("Guides", lang)} ${t("Not Found", lang)} - Slay the Spire 2 (sts2) | ${SITE_NAME}` };
    }
    const guide: Guide = await res.json();
    const title = `${guide.title} - Slay the Spire 2 Guide | ${SITE_NAME}`;
    const description = clipMetaDescription(stripTagsFlat(guide.summary || ""));
    return {
      title,
      description,
      // No hreflang alternates: guides are English-language content; the
      // localized wrappers served the same English body on 13 URLs per
      // guide, which crawlers flagged as language mismatches and
      // near-duplicates (same pattern as /<lang>/runs). Canonical stays
      // on the English guide even from a locale URL.
      alternates: { canonical: `${SITE_URL}/guides/${slug}` },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/guides/${slug}`,
        siteName: SITE_NAME,
        type: "article",
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return { title: `Guide - Slay the Spire 2 (sts2) | ${SITE_NAME}` };
  }
}

export default async function GuideDetailPage({ params }: Props) {
  const { lang: _lang, slug } = await params;
  const lang = langOrDefault(_lang);
  let guide: Guide | null = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API}/api/guides/${slug}`, { next: { revalidate: 300 } });
    if (res.ok) guide = await res.json();
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!guide) redirectMissingEntity("guides", slug);

  const jsonLd = guide
    ? [
        ...buildDetailPageJsonLd({
          name: guide.title,
          description: guide.summary,
          path: `/guides/${slug}`,
          category: guide.category,
          breadcrumbs: [
            { name: t("Home", lang), href: "/" },
            { name: t("Guides", lang), href: "/guides" },
            { name: guide.title, href: `/guides/${slug}` },
          ],
        }),
        buildFAQPageJsonLd([
          {
            question: `What does "${guide.title}" cover?`,
            answer: guide.summary || `A Slay the Spire 2 guide on ${guide.category}.`,
          },
          {
            question: "Where can I find more Slay the Spire 2 guides?",
            answer: "Browse all community guides at spire-codex.com/guides, filtered by category, difficulty, and character.",
          },
        ]),
      ]
    : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <GuideDetail slug={slug} initialGuide={guide} />
    </div>
  );
}
