import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import Link from "next/link";
import { getLangOrDefault, isValidLang, LANG_HREFLANG } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export interface MechanicSectionMeta {
  slug: string;
  title: string;
  description: string;
  category: "mechanics" | "secrets";
  order: number;
}

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

async function fetchSections(): Promise<MechanicSectionMeta[]> {
  // Tolerates ECONNREFUSED, the Docker frontend build runs `npm run build`
  // before the backend container exists, and Next.js will still try to
  // statically render this page. Returning [] lets the build succeed; the
  // page renders empty in the build output and is hydrated on first
  // post-deploy request.
  try {
    const res = await fetch(`${API_INTERNAL}/api/mechanics/sections`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return (await res.json()) as MechanicSectionMeta[];
  } catch {
    return [];
  }
}

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return buildPageMetadata({
    lang: _lang,
    path: "/mechanics",
    title: t("Game Mechanics", lang),
    description: t("mechanics_tagline", lang),
  });
}

export default async function MechanicsPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);

  const sections = await fetchSections();
  const mechanics = sections.filter((s) => s.category === "mechanics");
  const secrets = sections.filter((s) => s.category === "secrets");

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Mechanics", lang), href: `${prefix}/mechanics` },
    ]),
    buildCollectionPageJsonLd({
      name: `Slay the Spire 2 ${t("Game Mechanics", lang)}`,
      description: t("mechanics_tagline", lang),
      path: `${prefix}/mechanics`,
      items: sections.map((s) => ({ name: s.title, path: `${prefix}/mechanics/${s.slug}` })),
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Game Mechanics", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("mechanics_tagline", lang)}
      </p>

      <h2 id="mechanics" className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Mechanics", lang)}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {mechanics.map((s) => (
          <Link
            key={s.slug}
            href={`${prefix}/mechanics/${s.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all cursor-pointer block"
          >
            <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] mb-2">{s.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.description}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Secrets & Trivia", lang)}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {secrets.map((s) => (
          <Link
            key={s.slug}
            href={`${prefix}/mechanics/${s.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-emerald-800/30 p-5 hover:bg-[var(--bg-card-hover)] hover:border-emerald-600/50 transition-all cursor-pointer block"
          >
            <h3 className="font-semibold text-emerald-400 mb-2">{s.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
