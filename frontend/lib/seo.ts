import type { Metadata } from "next";
import {
  SUPPORTED_LANGS,
  LANG_HREFLANG,
  isValidLang,
  getLangOrDefault,
} from "./languages";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";
export const SITE_NAME = "Spire Codex";
// Default social card for all non-home pages. The black-background
// silent logo composition reads as a self-contained brand asset on any
// surface (Twitter, Discord, FB) and replaces the older
// `og-image.png` which is left in `public/` for backwards-compat with
// any external links already pointing at it.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/spire-codex-white-silent-black-background.png`;

// Bare-logo asset used on the home page only (transparent background,
// no decoration). Pages that want the bare logo instead of the branded
// composition import this directly.
export const HOME_OG_IMAGE = `${SITE_URL}/spire-codex-black-final.png`;

/**
 * The English title suffix, as a Next `title.template`. Pages supply only
 * their own segment and this appends the rest.
 *
 * Any layout that sets a plain-string `title` **replaces** the inherited
 * template with nothing, silently un-suffixing every route beneath it — so
 * a section layout with children must re-declare the template alongside
 * its title: `title: { default: title, template: TITLE_TEMPLATE }`.
 * The localized equivalent is built per-locale in `app/[lang]/layout.tsx`.
 */
export const TITLE_TEMPLATE = `%s - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
export const TITLE_DEFAULT = `Database - Slay the Spire 2 (sts2) | ${SITE_NAME}`;

/**
 * Build the `alternates.languages` map for a given English-side path,
 * pointing to every supported locale variant + `x-default`.
 *
 * Bidirectional hreflang is the indexation signal Google uses to
 * disambiguate translated copies, without it, Google sees /cards and
 * /jpn/cards as competing for the same query and picks ONE to index,
 * dumping the rest into "Crawled - currently not indexed". With it,
 * each locale variant indexes on its own and gets served to its
 * matching audience.
 *
 * Pass the bare path with no /[lang]/ prefix (e.g. "/cards", "/relics"
 * or "/cards/strike"). Returns a Record<hreflang, fullURL> ready to
 * spread into Next.js `alternates.languages`.
 */
export function buildLanguageAlternates(path: string): Record<string, string> {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const map: Record<string, string> = {
    en: `${SITE_URL}${trimmed}`,
    "x-default": `${SITE_URL}${trimmed}`,
  };
  // For the home page the localized URL is /<code>, not /<code>/ — the
  // trailing-slash form 308s, and hreflang alternates must not redirect
  // (every crawl flagged them as incorrect hreflang links).
  const suffix = trimmed === "/" ? "" : trimmed;
  for (const code of SUPPORTED_LANGS) {
    // "eng" is a valid [lang] segment, but its canonical home is the bare
    // path above, not /eng/... — skip it here so the loop doesn't clobber
    // the `en` entry already seeded to the bare path with `/eng/...`.
    if (code === "eng") continue;
    map[LANG_HREFLANG[code]] = `${SITE_URL}/${code}${suffix}`;
  }
  return map;
}

/**
 * Prefix a bare path with a locale segment, when one is present.
 *
 * The single implementation of locale prefixing, shared by
 * `buildPageMetadata` below and by JSON-LD call sites (whose builders take
 * an already-prefixed path, the opposite convention to
 * `buildLanguageAlternates`). Pass the bare path either way.
 *
 * `lang` is used exactly as given and never defaulted: an absent or
 * unrecognised segment yields the bare English path, never `/eng/...`.
 * `"eng"` itself also yields the bare path — it's a valid `[lang]` segment
 * (so `/eng/cards` renders), but /eng/... and the bare page are the same
 * English content, so canonical hands all the equity to one URL.
 */
export function localizedPath(lang: string | undefined, path: string): string {
  const bare = path.startsWith("/") ? path : `/${path}`;
  if (!lang || lang === "eng" || !isValidLang(lang)) return bare;
  // The home page localizes to `/<code>`, not `/<code>/` — the trailing
  // slash form 308s, and neither canonicals nor hreflang may point at a
  // redirect.
  return bare === "/" ? `/${lang}` : `/${lang}${bare}`;
}

export interface PageMetadataInput {
  /**
   * Raw `[lang]` route segment, or undefined on the canonical English
   * route. Used for the canonical prefix exactly as given, never
   * defaulted. (`openGraph.locale` does need a concrete value, and
   * defaults to `en` — keep the two uses distinct.)
   */
  lang?: string;
  /** Bare path, never locale-prefixed: "/relics", "/cards/strike", "/". */
  path: string;
  /**
   * This segment only, never the full title — the layout's `title.template`
   * appends the site suffix, and og/twitter titles inherit the resolved
   * result. See `app/layout.tsx` and `app/[lang]/layout.tsx`.
   */
  title: string;
  description?: string;
  /** Defaults to "website". */
  ogType?: "website" | "article" | "profile";
  /**
   * Adds robots noindex and suppresses hreflang, while keeping the
   * canonical. A noindexed page should not anchor an hreflang cluster,
   * and most noindexed routes (admin, tools) have no localized variants
   * to advertise in the first place.
   */
  noindex?: boolean;
  /**
   * Whether this route self-canonicalizes per locale and advertises
   * hreflang. Defaults to true.
   *
   * Set false for a route whose content doesn't actually vary by locale
   * (English-only user/game data wearing localized chrome) — canonical
   * always points at the bare English path regardless of `lang`, and no
   * hreflang alternates are emitted, since there is only one indexable
   * URL to advertise. This is the flag that replaces those routes'
   * previous behaviour of force-redirecting `/<lang>/foo` to `/foo`:
   * pair it with `noindex: Boolean(lang)` so the canonical English page
   * stays indexed while every locale variant does not (yet).
   */
  offerLanguageAlternatives?: boolean;
}

/**
 * Build a page's Next.js `Metadata`.
 *
 * Canonical and hreflang are both *derived* from the route (and the
 * `offerLanguageAlternatives` flag) rather than passed separately, so they
 * cannot drift apart. By default canonical self-references the path's own
 * locale (`/esp/cards` → `/esp/cards`, `/cards` → `/cards`) and hreflang is
 * emitted; see `offerLanguageAlternatives` on `PageMetadataInput` for the
 * English-only alternative.
 *
 * Deliberately omits four fields Next fills in better than we can:
 * `openGraph.title`, `openGraph.description`, and the whole `twitter`
 * block. Next inherits og/twitter title+description from the *resolved*
 * page title (so they pick up the layout template), and inherits
 * `twitter.card` from the root layout. Setting them here would write one
 * string into three places, which is what this helper exists to stop.
 *
 * Callers needing something rarer — a different OG image, an off-site
 * canonical, article timestamps — spread the result and override. Spread
 * the nested object too, or the other openGraph fields are dropped:
 *
 *   const meta = buildPageMetadata({ ... });
 *   return { ...meta, openGraph: { ...meta.openGraph, images } };
 */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const {
    lang,
    path,
    title,
    description,
    ogType,
    noindex,
    offerLanguageAlternatives = true,
  } = input;
  const canonical = offerLanguageAlternatives
    ? localizedPath(lang, path)
    : localizedPath(undefined, path); // always the bare English path

  return {
    title,
    description,
    openGraph: {
      // Must stay complete: Next replaces `openGraph` wholesale rather
      // than merging it, so anything the root layout sets has to be
      // restated here or it is lost.
      type: ogType ?? "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}${canonical}`,
      locale: LANG_HREFLANG[getLangOrDefault(lang)],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    ...(noindex && { robots: { index: false, follow: false } }),
    alternates: {
      canonical,
      languages:
        noindex || !offerLanguageAlternatives
          ? undefined
          : buildLanguageAlternates(path),
    },
  };
}

export function stripTags(text: string): string {
  return text
    .replace(/\[energy:(\d+)\]/g, "$1 Energy")
    .replace(/\[star:(\d+)\]/g, "$1 Star")
    .replace(/\[\/?\w+(?:[=:][^\]]+)?\]/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Strip tags and collapse all newlines into a single line for meta descriptions. */
export function stripTagsFlat(text: string): string {
  return stripTags(text).replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Clip a meta-description-style string to Google's effective SERP
 * window (~160 chars). Truncates on a word boundary and appends an
 * ellipsis when the input overflows; passes short inputs through
 * unchanged. Use on detail-page `metadata.description` values so a
 * card with a long resolved description doesn't get cut mid-word in
 * Google search.
 */
export function clipMetaDescription(text: string, max = 160): string {
  if (!text) return text;
  const flat = text.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
  if (flat.length <= max) return flat;
  // Reserve 1 char for the ellipsis we append. Slice to (max-1), then
  // back up to the previous word boundary so we don't truncate
  // mid-word.
  const sliced = flat.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced;
  return cut.replace(/[\s\p{P}]+$/u, "") + "…";
}
