import type { Metadata } from "next";
import Link from "next/link";
import { redirect, permanentRedirect } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildNewsArticleJsonLd } from "@/lib/jsonld";
import { SITE_URL, SITE_NAME, buildPageMetadata } from "@/lib/seo";
import type { NewsArticle } from "@/lib/api";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import {
  sanitizeSteamNews,
  newsExcerpt,
  formatNewsDate,
  gidFromSlug,
  newsSlugForArticle,
  canonicalSteamUrl,
  firstNewsImage,
} from "@/lib/steam-news";
import { getLangOrDefault, isValidLang, LANG_GAME_NAME, LANG_HREFLANG } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Skip the build-time prerender, CI doesn't have the backend so it would
// 404 every article and bake those 404s into the image.
export const dynamic = "force-dynamic";
export const revalidate = 1800;

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

async function fetchItem(gid: string): Promise<NewsArticle | null> {
  try {
    const res = await fetch(`${API}/api/news/${encodeURIComponent(gid)}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as NewsArticle;
  } catch {
    return null;
  }
}

/** The slug catchall accepts a few shapes:
 *
 *   - `/news/{gid}`                  , current canonical shape, clean
 *     and shareable
 *   - `/news/{encoded canonical url}`, older encoded-URL form, kept so
 *     prior inbound links and search results still resolve
 *
 * Either way we pull the gid out, look up the archived article, and (if
 * the request came in on the encoded-URL form) 308-redirect to the bare
 * gid so search engines and shares converge on one canonical address.
 */
function joinSlug(parts: string[]): string {
  // Next.js splits the catchall on `/`. Bare gids are a single segment;
  // the older encoded-URL form was also a single segment. Steam URLs
  // occasionally leak through unencoded as multiple segments, rejoin
  // defensively so `gidFromSlug()` can still pull the trailing digits.
  return parts.join("/");
}

type Props = { params: Promise<{ lang?: string; slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang, slug } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const newsLabel = t("News", lang);
  const gid = gidFromSlug(joinSlug(slug));
  if (!gid) return { title: `${gameName} ${newsLabel} - ${t("Not Found", lang)} | ${SITE_NAME}` };
  const article = await fetchItem(gid);
  if (!article) return { title: `${gameName} ${newsLabel} - ${t("Not Found", lang)} | ${SITE_NAME}` };
  // Lead the meta description with Spire Codex framing so search snippets
  // identify the page as our archive of the Steam announcement, not just
  // the raw article body.
  const excerpt = newsExcerpt(article.contents ?? "", 160);
  const description = `${gameName} ${newsLabel}, ${article.title}. ${excerpt}`.slice(0, 160);
  const title = `${article.title} - ${gameName} ${newsLabel}`;
  const canonicalPath = newsSlugForArticle(article.gid, `${prefix}/news`);
  const meta = buildPageMetadata({
    lang: _lang,
    path: canonicalPath,
    title,
    description,
    ogType: "article",
    // The real canonical is external (Steam), so there's no on-site
    // hreflang cluster to advertise.
    offerLanguageAlternatives: false,
  });
  return {
    ...meta,
    // External canonical → Steam, so search engines treat us as a mirror.
    alternates: { canonical: canonicalSteamUrl(article.gid) },
    openGraph: {
      ...meta.openGraph,
      type: "article",
      title: article.title,
      url: `${SITE_URL}${canonicalPath}`,
      publishedTime: new Date(article.date * 1000).toISOString(),
      authors: article.author ? [article.author] : undefined,
      images: [{ url: firstNewsImage(article.contents) ?? DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title: article.title, description, images: [firstNewsImage(article.contents) ?? DEFAULT_OG_IMAGE] },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const { lang: _lang, slug } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const joined = joinSlug(slug);
  const gid = gidFromSlug(joined);
  // Slug doesn't contain a gid, 308 back to the (possibly localized) news
  // index so any crawl equity from the bad path lands on a live page
  // rather than a 404.
  if (!gid) permanentRedirect(`${prefix}/news`);

  // The canonical shape is `/news/{gid}` (or `/<lang>/news/{gid}`), clean,
  // shareable, and stable. If the caller used the older encoded-URL form
  // (or anything else that happened to contain the gid), 308-redirect to
  // the bare-gid path so every flavour of inbound link converges on the
  // canonical address.
  if (joined !== gid) {
    redirect(newsSlugForArticle(gid, `${prefix}/news`));
  }

  const article = await fetchItem(gid);
  // Archive miss, 308 back to /news so we transfer link equity to the
  // list page rather than serving a hard 404. Most legitimate misses
  // are stale Google cache entries for articles Steam has rotated off
  // and we never archived; sending them to /news keeps the entries in
  // our domain's "alive" set.
  if (!article) permanentRedirect(`${prefix}/news`);

  const html = sanitizeSteamNews(article.contents ?? "");
  const date = formatNewsDate(article.date);
  const description = newsExcerpt(article.contents ?? "", 250);
  const publishedIso = new Date(article.date * 1000).toISOString();
  const onSitePath = newsSlugForArticle(article.gid, `${prefix}/news`);

  const jsonLd: Record<string, unknown>[] = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("News", lang), href: `${prefix}/news` },
      { name: article.title, href: onSitePath },
    ]),
    buildNewsArticleJsonLd({
      headline: article.title,
      description,
      datePublished: publishedIso,
      author: article.author ?? null,
      feedlabel: article.feedlabel ?? null,
      externalCanonical: canonicalSteamUrl(article.gid),
      externalUrl: article.url,
      path: onSitePath,
      inLanguage: LANG_HREFLANG[lang],
      imageUrl: firstNewsImage(article.contents) ?? undefined,
    }),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <Link
        href={`${prefix}/news`}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> {t("Back to", lang)} {t("News", lang)}
      </Link>

      <article>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2 leading-tight">
          {article.title}
        </h1>
        <p className="text-xs text-[var(--text-muted)] mb-1">
          <time dateTime={publishedIso}>{date}</time>
          {" · "}
          {article.feedlabel}
          {article.author ? ` · ${article.author}` : ""}
          {article.tags?.includes("patchnotes") ? ` · ${t("Patch Notes", lang)}` : ""}
        </p>
        {/* Kept English/untranslated: the "news_attribution" key drops the
            dynamic link to the original publisher/Steam that this paragraph
            carries, so translating it would lose the outbound citation. */}
        <p className="text-xs text-[var(--text-muted)] mb-6">
          From{" "}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--accent-gold)]"
          >
            {article.is_external_url ? "the original publisher" : "Steam"}
          </a>
          {" "}content © Mega Crit Games / respective publisher. Spire Codex mirrors this
          announcement so it stays searchable after Steam rotates it off the news feed.
        </p>

        <div
          className="news-article prose prose-invert max-w-none text-[var(--text-secondary)] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <p className="mt-8 pt-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
          {t("Read on Steam", lang)}:{" "}
          <a
            href={canonicalSteamUrl(article.gid)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--accent-gold)] hover:text-white"
          >
            {canonicalSteamUrl(article.gid)}
          </a>
        </p>
      </article>
    </div>
  );
}
