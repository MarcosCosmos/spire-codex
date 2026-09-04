import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { clipMetaDescription, buildPageMetadata, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { fetchEntityRes } from "@/lib/entity-fetch";
import Link from "next/link";
import MechanicMarkdown from "./MechanicMarkdown";
import type { MechanicSectionMeta } from "../page";
import { getLangOrDefault, isValidLang, LANG_HREFLANG } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

interface MechanicSectionDetail extends MechanicSectionMeta {
  body_markdown: string;
}

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

async function fetchSection(slug: string): Promise<MechanicSectionDetail | null> {
  // notFound() only on a definitive 404; backend 5xx or network failure
  // throws (500) so an outage window cannot mass-404 real pages. Detail
  // routes have no generateStaticParams, so nothing fetches at build time.
  const res = await fetchEntityRes(`${API_INTERNAL}/api/mechanics/sections/${slug}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as MechanicSectionDetail;
}

type Props = { params: Promise<{ lang?: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang, slug } = await params;
  const lang = getLangOrDefault(_lang);
  const section = await fetchSection(slug);
  if (!section) return { title: `${t("Not Found", lang)} | ${SITE_NAME}` };
  const title = `${section.title}`;
  const description = clipMetaDescription(section.description);
  return buildPageMetadata({
    lang: _lang,
    path: `/mechanics/${slug}`,
    title,
    description,
    ogType: "article",
  });
}

export default async function MechanicDetailPage({ params }: Props) {
  const { lang: _lang, slug } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const section = await fetchSection(slug);
  if (!section) notFound();

  // buildDetailPageJsonLd already appends a BreadcrumbList from `breadcrumbs`,
  // so we don't emit a separate buildBreadcrumbJsonLd here (would have
  // duplicated the BreadcrumbList entity in Search Console).
  const jsonLd = buildDetailPageJsonLd({
    name: `${section.title} - Slay the Spire 2`,
    description: section.description,
    path: `${prefix}/mechanics/${slug}`,
    category: section.category === "secrets" ? "Secrets & Trivia" : "Game Mechanics",
    breadcrumbs: [
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Mechanics", lang), href: `${prefix}/mechanics` },
      { name: section.title, href: `${prefix}/mechanics/${slug}` },
    ],
    inLanguage: LANG_HREFLANG[lang],
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <Link
        href={`${prefix}/mechanics`}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> {t("Back to", lang)} {t("Mechanics", lang)}
      </Link>
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{section.title}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">{section.description}</p>
      <MechanicMarkdown body={section.body_markdown} />
    </div>
  );
}
