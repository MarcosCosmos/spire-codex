# SEO metadata duplication — findings & proposed helper

## Context

While restoring `[lang]` routes for previously-redirected pages, the same ~30-line
`generateMetadata` block kept getting hand-copied into each new file, and each copy drifted
slightly (I shipped one myself in `[lang]/runs/page.tsx` that was missing `openGraph`/`twitter`
entirely, and had to hand-roll a `langPrefix()` in `[lang]/archetypes/page.tsx`). This report
audits how metadata is actually written across the app, catalogues the drift, and sketches a
shared helper.

**Deliverable is this report.** No code changes proposed for immediate execution; the helper
below is a sketch to react to, and the live bugs in §3 are logged for separate fixes.

**Scope note.** Localisation is expected to move to an i18n framework (next-intl) later, which
will absorb the *translation-coverage* problems here. So this report deliberately targets only
the **structural** metadata concern — duplication and drift in how the `Metadata` object is
assembled. Findings that are really i18n-coverage problems are tagged **[i18n]** and parked;
§4.1 explains why the proposed helper is designed to survive that migration untouched.

---

## 1. Scale of the duplication

| Measure | Count |
|---|---|
| Route files exporting metadata | **162** (123 `generateMetadata` + 39 static `metadata`) |
| Files repeating `twitter: { card: "summary_large_image", title, description }` | **146** |
| Files calling `buildLanguageAlternates` | **124** |
| `app/[lang]/**/page.tsx` files | 79 |

Roughly **62 of the 79** `[lang]` pages are the same block, identical modulo the entity noun:
resolve lang → build `title`/`description` → emit `openGraph` (7 keys) → `twitter` (3 keys) →
`alternates` (canonical + hreflang). `lib/seo.ts` holds constants and `buildLanguageAlternates`,
but **no helper anywhere returns a `Metadata` object** — every one of the 162 sites assembles it
by hand.

---

## 2. Inconsistencies, with evidence

**2.1 Two incompatible locale-resolution strategies.** 72 `[lang]` pages do
`if (!isValidLang(lang)) return {}`; 8 do `getLangOrDefault(lang)`. The first yields a page with
**zero meta tags** for an unknown locale (the default export then `return null`s → blank page,
not a 404). The second degrades to `eng`. Nothing reconciles them.

**2.2 The canonical strategy is a per-file judgement call, encoded only in prose comments.**
Three modes exist in the wild:
- *locale* — self-canonical `/{lang}/foo` + hreflang (the ~62-file majority)
- *english* — canonical folds back to `/foo`, hreflang deliberately omitted
  (`[lang]/runs`, `[lang]/runs/[hash]`, `[lang]/guides/[slug]`, `[lang]/players/[username]`)
- *none* — noindex tools (`deck-lab`, `live`, `seed-lab`)

The invariant "self-canonical ⟺ emits hreflang" holds by convention only, and
**`[lang]/guides/submit` already breaks it**: self-canonical, indexable, no `languages`.
*Superseded by the decision in §4.3 — canonical now follows the path's locale unconditionally, so
the three modes collapse to one rule plus a noindex flag.*

**2.3 Indexable pages missing `openGraph`/`twitter` entirely.** Worst case
`[lang]/tier-list-maker` — has `description` *and* full hreflang, but no social tags at all.
Also `news/codex/[slug]` (og, no twitter), plus the noindex set where it matters less.

**2.4 `openGraph.locale` silently missing** on `[lang]/charts` and `[lang]/giveaway` while ~60
siblings set it.

**2.5 Absolute vs relative canonical.** Detail pages use `` `${SITE_URL}/foo` ``, index pages use
`"/foo"`. Within `[lang]`, 6 files (`archetypes`, `charts`, `mechanics`, `mechanics/[slug]`,
`news`, `tier-list-maker`) go absolute against ~62 relative. Functionally equivalent via
`metadataBase` — but it is a reliable tell that there is no single source.

**2.6 [i18n] Hardcoded English on localized routes.** `tier-list-maker` and `charts`
descriptions, `settings`, `profile`, `uninstall`; `merchant`'s JSON-LD description is English
while its `<meta>` description is translated; and **every** `[lang]/*/[id]` not-found title is the
English `"X Not Found - Slay the Spire 2 (sts2) | Spire Codex"`. *Parked — this is exactly the
coverage gap the next-intl migration exists to close; a metadata helper cannot fix it.*

**2.7 Title drift — two separable halves.** *Structural:* `| Spire Codex` literal vs
`` | ${SITE_NAME} `` (a constant, not a translation) — in scope. *[i18n]:* whether the
`(${nativeName})` suffix appears, and `"Slay the Spire 2"` hardcoded vs `${gameName}` — these are
wording decisions that should be settled inside the i18n layer, not the metadata assembler.

**2.8 Metadata lives in different files.** ~30 canonical routes put it in a sibling `layout.tsx`
rather than `page.tsx`, so "does this route have metadata?" can't be answered by reading the page.

---

## 3. Live bugs found (log separately — not inconsistency, actual defects)

**3.1 `buildLanguageAlternates` never self-references — `lib/seo.ts:33-47`.**
`SUPPORTED_LANGS` includes `"eng"` and `LANG_HREFLANG.eng === "en"`, so line 36's
`en → ${SITE_URL}/cards` is **overwritten** by the loop's final iteration with
`en → ${SITE_URL}/eng/cards`. Every one of the 124 call sites emits an hreflang cluster in which
the bare English URL never points at itself (only `x-default` survives). A missing self-reference
invalidates the cluster — which is precisely the "competing duplicates → *Crawled - currently not
indexed*" failure the function's own docstring says it exists to prevent. It also leaves `/cards`
and `/eng/cards` as indexable duplicates.

**3.2 Five routes advertise hreflang for `[lang]` pages that do not exist** (verified: each emits
`buildLanguageAlternates`, each has no `app/[lang]/…` counterpart) — so Google is being handed
404s as translation targets:
`cards/browse/[slug]`, `tier-list/cards`, `tier-list/potions`, `tier-list/relics`, `timeline/[id]`.

**3.3 Query strings leak into hreflang.** `tier-list/cards` and `tier-list/relics` pass paths
carrying `?color=…`, producing alternates like `${SITE_URL}/jpn/tier-list/cards?color=red`.

**3.4 The two path conventions are opposites.** `buildLanguageAlternates(path)` wants a **bare**
path; every `lib/jsonld.ts` builder interpolates `` `${SITE_URL}${path}` `` raw and expects the
**caller** to have locale-prefixed it. Same concern, same file pair, inverted contracts.

**3.5 Three sources of truth for "which routes are localized":** the `app/[lang]/` filesystem,
whichever pages happen to call `buildLanguageAlternates`, and two hand-maintained lists in
`app/sitemap.ts` (`LANG_LIST_ROUTES` ~38, `LANG_DETAIL_ROUTES` ~19). §3.2 is what drift looks like.

**3.6 No tests.** Only `lib/card-prose.test.ts` and `lib/card-display.test.ts` exist; nothing
covers `buildLanguageAlternates`, `clipMetaDescription`, or the JSON-LD builders — which is why
3.1 went unnoticed.

**3.7 `app/[lang]/layout.tsx:42-48` hand-rolls its own alternates map** instead of calling
`buildLanguageAlternates`, and puts a **`"canonical"` key inside `languages`**:

```ts
const languages: Record<string, string> = {
  "x-default": `${SITE_URL}/`,
  "canonical":  `${SITE_URL}/`,   // ← emits <link rel="alternate" hreflang="canonical">
};
```

`canonical` is not a valid hreflang value, so that tag is junk in every localized page's `<head>`.
It is also a second, divergent implementation of 3.1's logic — note it does *not* have the `en`
overwrite bug, because it never seeds an `en` key at all, so `/xx/` clusters omit English entirely.

**3.8 The same layout sets `alternates.canonical: /${lang}`, which leaks to children.** Because
`alternates` is replaced wholesale only when a child *sets* it (§4.5), any `[lang]` page that
declares no `alternates` of its own inherits the layout's — so it canonicals to the locale **home
page**. That currently hits `[lang]/deck-lab`, `[lang]/live`, `[lang]/seed-lab`, `[lang]/settings`,
`[lang]/profile`, `[lang]/uninstall`: e.g. `/esp/deck-lab` declares itself a duplicate of `/esp`.
Both this and 3.7 disappear once the layout stops emitting `alternates` at all (§4.7 tier 2).

---

## 4. Proposed helper — sketch

One function in `lib/seo.ts`. Two ideas do the work: **canonical and hreflang are both derived
from the route rather than passed** (so 2.2 and the `guides/submit` class of bug become
unrepresentable), and **the title suffix moves into layout templates** (so 2.7 goes the same way).

### 4.1 Why this is worth doing *before* the next-intl migration

The helper sits on a clean seam:

> **Producing the strings** (title, description) is i18n's job — and is changing.
> **Assembling the `Metadata` object** (canonical, hreflang, og, twitter) is SEO's job — and is not.

`buildPageMetadata` deliberately takes `title` and `description` as **already-resolved plain
strings**. It performs no translation lookup, imports no `t()`, and touches no `LANG_*`
dictionary. So the next-intl migration changes *how callers compute the two strings they pass in*
— a call-site edit — and leaves the assembler untouched.

That ordering is the argument for doing this first rather than after: today the 162 call sites
each hand-roll the whole `Metadata` object, so the i18n migration would have to walk into all 162
and be careful not to disturb the SEO structure on the way past. Standardising first shrinks that
later migration to "change the two arguments", and gives it one obvious place to plug in.

Two coupling points to keep deliberately thin, since next-intl will want to own both:
- **Locale source.** The sketch takes `lang?: string` straight from the route segment. next-intl
  supplies the locale via its own routing/`getLocale()` instead. Keep it a plain parameter the
  caller passes, never read ambiently inside the helper, and this stays a call-site change.
- **hreflang generation.** next-intl can generate alternates from its routing config. The helper
  should keep delegating to a *single* named function (`buildLanguageAlternates` today) so that
  swapping in next-intl's equivalent is one edit, not 124.

### 4.2 Title templates — verified against Next 16.3.4's resolver

Read from `node_modules/next/dist/lib/metadata/`, not from docs, because the payoff depends on
exact behaviour:

1. **There are three independent templates**, not one
   (`resolve-metadata.js:806-809`): `titleTemplates.title`, `.openGraph`, `.twitter`. Each is fed
   only from its own `template` field, so a layout's `title.template` does **not** reach
   `openGraph.title` — `resolveOpenGraph()` is passed `titleTemplates.openGraph` (`:150`).
2. **But og/twitter inherit the fully-resolved title and description when they set none of their
   own** — `inheritFromMetadata(openGraph, metadata)` / `(twitter, metadata)` at
   `resolve-metadata.js:658-659`, copying `metadata.title` *after* the title template was applied
   at `:174`. Twitter additionally auto-fills from openGraph, including `images` (`:629-636`).

The consequence is the big one: **if the helper simply omits `openGraph.title`,
`openGraph.description`, `twitter.title` and `twitter.description`, Next fills all four correctly
from the templated page title.** Today all 146 files write the same string into three places by
hand. That is most of the duplication, and it disappears without a helper parameter.

So the structure becomes:

```ts
// app/layout.tsx — canonical English tree
export const metadata: Metadata = {
  title: {
    default:  `Database - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
    template: `%s - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  },
  // Mirrored deliberately: og has its own template channel. Without this,
  // og:title for a page that DOES set openGraph.title would go un-suffixed.
  openGraph: { title: { default: …, template: `%s - Slay the Spire 2 (sts2) | ${SITE_NAME}` } },
};

// app/[lang]/layout.tsx — identical shape, localized fragments only
return {
  title: {
    default:  `${gameName} ${dbWord} - ${SITE_NAME} (${nativeName})`,
    template: `%s - ${gameName} | ${SITE_NAME} (${nativeName})`,
  },
  openGraph: { title: { default: …, template: `%s - ${gameName} | ${SITE_NAME} (${nativeName})` } },
};
```

…and every page supplies **only its own segment**:

```ts
title: t("Relics", lang)     // → "Relics - Slay the Spire 2 (sts2) | Spire Codex"
                             //   or "Reliquias - Slay the Spire 2 (STS2) | Spire Codex (Español)"
```

This is what makes 2.7-structural *unrepresentable* rather than merely centralized: a page
physically cannot get the suffix wrong, because it never writes one. It also deletes the
`${SITE_NAME}`-vs-`"Spire Codex"` split and the `(${nativeName})` on/off inconsistency in one move.

**Escape hatch:** `[lang]/news/[...slug]` uses a genuinely different shape
(`"{article} - {gameName} {newsLabel} | {SITE_NAME}"`). Next supports exactly this via
`title: { absolute: … }`, which ignores parent templates — one route, so it stays an override
(§4.8) rather than a parameter.

**Migration caveat:** `title.default` is *required* alongside `template`, and a template in a
layout does not apply to that same layout's own title. `[lang]/layout.tsx` is a child of
`app/layout.tsx`, so the root template will start applying to it — its current title string must
move to `default`/`absolute` or it will get double-suffixed.

### 4.3 Parameters

Every parameter below is either universal or a closed set of 2-3 options that covers all routes.
Counts are from the current tree so each one can be spot-checked. Anything with a long tail was
**left out on purpose** — see §4.8.

> **Decision (settled):** canonical follows the **path's** locale, with no default resolution —
> `/esp/cards` → `/esp/cards`, `/cards` → `/cards`. Plus `/eng/*` **308-redirects to `/*`**, so the
> bare path is the sole English URL. Consequences in §4.6.
>
> This removes the `CanonicalStrategy` enum from the earlier draft entirely: canonical is now
> always `prefix + path`, mechanically derived from the route. There is no decision left to get
> wrong, which is strictly better than a 3-way enum.

```ts
type PageMetadataInput = {
  /**
   * Raw [lang] route segment. Present on app/[lang]/**, undefined on the
   * canonical English route — including the 8 re-export files, where Next
   * calls this with no lang segment at all (app/runs/page.tsx).
   *
   * Used for the canonical prefix EXACTLY as given — never defaulted, per the
   * decision above, so undefined yields "/cards" and never "/eng/cards".
   * (og:locale separately needs a concrete value; there `undefined` → "en".
   * Keep the two uses distinct — conflating them is how "no default
   * resolution" would get quietly violated.)
   *
   * Passed in, never read ambiently: see §4.1, next-intl will change the source.
   */
  lang?: string;

  /**
   * ALWAYS the bare path — never locale-prefixed. The helper does the
   * prefixing so no call site hand-rolls it (I wrote exactly that by hand in
   * [lang]/archetypes/page.tsx and it is the 3.4 footgun).
   *   "/relics"        ← [lang]/relics
   *   "/cards/strike"  ← [lang]/cards/[id]
   *   "/"              ← [lang]/page.tsx  (home; buildLanguageAlternates already special-cases it)
   */
  path: string;

  /**
   * THIS SEGMENT ONLY — never the full title. The layout template adds the
   * suffix (§4.2), and og:title / twitter:title inherit the resolved result,
   * so this string is written exactly once per route.
   *   t("Relics", lang)          ← [lang]/relics      → "Relics - Slay the Spire 2 (sts2) | Spire Codex"
   *   card.name                  ← [lang]/cards/[id]
   *   `${username} - ${char} …`  ← [lang]/runs/[hash] (segment is just the run description)
   * Already-resolved string: no t() inside the helper — see §4.1.
   */
  title: string;
  description?: string;

  /**
   * Only 3 values exist in the tree: "website" ×97, "article" ×50, "profile" ×1.
   *   "website" → index/list pages ([lang]/relics, [lang]/charts)
   *   "article" → detail pages ([lang]/cards/[id], [lang]/runs/[hash], [lang]/guides/[slug])
   *   "profile" → [lang]/players/[username] only — borderline, could equally be an override.
   * Default "website".
   */
  ogType?: "website" | "article" | "profile";

  /**
   * 26 routes set robots noindex today: [lang]/deck-lab, [lang]/live,
   * [lang]/seed-lab, [lang]/settings, [lang]/profile, app/uninstall, app/admin/* (13).
   * Binary and unambiguous, so it earns a parameter rather than an override.
   *
   * Now doubles as the old "none" strategy: noindex routes emit neither
   * canonical nor hreflang, so one flag replaces what was a second enum value.
   */
  noindex?: boolean;
};

function buildPageMetadata(i: PageMetadataInput): Metadata {
  // Prefix from the path as-given, never defaulted. /eng/* 308s away (§4.6),
  // so an "eng" segment should not reach here.
  const prefix = i.lang && isValidLang(i.lang) ? `/${i.lang}` : "";
  const canonicalPath = `${prefix}${i.path}`;   // always — noindex does not suppress it

  return {
    title: i.title,                              // layout template adds the suffix (§4.2)
    description: i.description,
    openGraph: {
      // Must be complete: `openGraph` is REPLACED, not merged (§4.5), so
      // every field the root layout sets has to be restated here.
      type: i.ogType ?? "website",
      siteName: SITE_NAME,
      url: canonicalPath && `${SITE_URL}${canonicalPath}`,   // no auto-resolve (§4.5)
      locale: LANG_HREFLANG[getLangOrDefault(i.lang)],       // 2.4 — display value, may default
      images: [{ url: DEFAULT_OG_IMAGE }],       // 126 of 133; the 7 exceptions override (§4.8)
      // NO title / description: inheritFromMetadata (resolve-metadata.js:658)
      // copies the *resolved* ones. Setting them here would re-introduce the
      // three-copies-of-one-string problem the template exists to remove.
    },
    // NO twitter block at all — the root layout's `twitter: { card }` is
    // inherited untouched (nothing here sets the key), and postProcessMetadata
    // auto-fills title/description/images from openGraph (:629-636).
    // This is where 2.3's 146 duplicate copies actually go to die.
    ...(i.noindex && { robots: { index: false, follow: false } }),
    alternates: {
      canonical: canonicalPath,                  // 2.5 — one absolute/relative decision
      // Derived, never passed: hreflang cannot drift out of step with canonical.
      languages: i.noindex ? undefined : buildLanguageAlternates(i.path),
    },
  };
}
```

The helper is now **6 parameters with no strategy enum**, and its entire remaining job is
canonical / hreflang / og-locale — exactly the part that was drifting. `twitter` is gone
completely; `openGraph` carries only structural fields.

Call site, before (`[lang]/relics/page.tsx`, ~30 lines) → after — note the title is now just the
segment, since the layout template owns the suffix:

```ts
return buildPageMetadata({
  lang,
  path: "/relics",
  title: t("Relics", lang),              // → "Relics - Slay the Spire 2 (sts2) | Spire Codex"
  description: t("relics_tagline", lang),
});
```

### 4.5 What layout inheritance does — and does not — simplify

Next merges metadata **by replacing whole top-level keys**, not by deep-merging
(`resolve-metadata.js:177-190`: `newResolvedMetadata.openGraph = resolveOpenGraph(metadata.openGraph, …)`,
receiving only the new value). So inheritance is all-or-nothing per key:

**Genuinely simplifies — move to / keep in the layout, omit from every page:**
- `twitter: { card }` — no page needs to vary it, so no page should set the key. Already in
  `app/layout.tsx:90-92`; the helper just stops emitting it. Auto-fill does the rest.
- `title.template` + `openGraph.title.template` (§4.2) — the whole suffix.
- `metadataBase`, `icons` — already correct in the root layout.
- `openGraph.locale` **for the `[lang]` subtree**, in principle — it is constant per locale.

**Does NOT simplify — the helper must keep emitting these in full:**
- Everything else in `openGraph`. The moment a page sets one og field (and it must: `og:url` is
  route-specific and does *not* auto-resolve — `resolve-opengraph.js:152` sets it to `null` when
  unset), the page's `openGraph` **replaces** the layout's, silently dropping `siteName`,
  `images`, `type` and `locale`. That is precisely bug 2.4's failure mode, re-armed.
- `alternates` — path-specific by definition.

**So the trap to document loudly:** partial `openGraph` inheritance looks like it works and then
quietly strips fields. The helper always emitting a complete `openGraph` block is what makes this
safe, and is why og:locale stays in the helper rather than moving to `[lang]/layout.tsx` despite
being constant there.

### 4.6 Consequences of the canonical decision

1. **The `english` strategy disappears**, so four routes change behaviour:
   `[lang]/runs`, `[lang]/runs/[hash]`, `[lang]/guides/[slug]`, `[lang]/players/[username]` stop
   folding to English and canonical to their own locale path like everything else. **The comments
   currently in those files argue the opposite** (citing a real GSC incident of ~5,000
   *"Duplicate without user-selected canonical"* pages) — they must be rewritten, not left to
   contradict the code.
2. **Those four also get `noindex` for now** *(decided)*. This neatly defuses the sequencing risk:
   the GSC incident happened because those variants were English content in localized chrome, and
   their translation coverage is still thin ([i18n], §2.6). `noindex` holds them out of the index
   until coverage lands, at which point removing one flag turns them on — no canonical rework.

   Note this makes `noindex` **suppress hreflang but keep canonical**, which is why the sketch
   splits those two rather than gating both on the same flag:
   - *Canonical kept* — harmless, and correct the moment `noindex` lifts.
   - *hreflang suppressed* — a noindexed page should not anchor an hreflang cluster (Google
     discards such clusters). It also stops `app/admin/*` and the tool routes from advertising
     15 locale variants that **do not exist** — i.e. it prevents re-creating §3.2 wholesale.

   The self-healing property is the point: these four start emitting hreflang automatically when
   the flag is removed, with no second decision to remember.
3. **`/eng/*` → `/*` 308** makes the bare path the sole English URL. Follow-ups: strip the prefix
   in middleware, stop `sitemap.ts` emitting `/eng/…` (it currently does not filter `eng` —
   `SUPPORTED_LANGS.flatMap`, three sites), and fix **3.1** so `en` hreflang points at the bare
   path. 3.1 stops being cosmetic here: pointing `en` at `/eng/cards` would aim an hreflang at a
   redirect, which Google drops.

### 4.7 What each `layout.tsx` tier provides

Three tiers. The rule of thumb: **a layout owns what none of its descendants can vary; the helper
owns everything route-specific.** Anything in between is the §4.5 replacement trap.

#### Tier 1 — `app/layout.tsx` (root, English tree)

Site-wide invariants. Mostly already correct; two additions and one promotion.

| Field | Now | Change |
|---|---|---|
| `metadataBase` | ✅ set | keep |
| `icons` | ✅ set | keep |
| `title` | plain string | **→ `{ default, template: "%s - Slay the Spire 2 (sts2) \| Spire Codex" }`** |
| `openGraph.title` | — | **add `{ default, template: … }`** — og has its own template channel (§4.2) |
| `openGraph` type/siteName/images | ✅ set | keep as fallback for pages that set no og at all |
| `twitter: { card }` | ✅ set | keep — now **load-bearing**: pages must stop setting `twitter` so this is inherited |
| `description` | ✅ set | keep as fallback only |
| canonical / hreflang | absent | keep absent — route-specific, helper's job |

#### Tier 2 — `app/[lang]/layout.tsx` (localized tree)

Mirrors tier 1 with localized fragments, so the two trees have identical structure and pages
differ only in the segment they supply. Also where §3.7's bugs get deleted.

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};
  const gameName = LANG_GAME_NAME[lang], nativeName = LANG_NAMES[lang];

  return {
    title: {
      default:  `${gameName} ${LANG_DATABASE[lang]} - ${SITE_NAME} (${nativeName})`,
      template: `%s - ${gameName} | ${SITE_NAME} (${nativeName})`,
    },
    openGraph: {
      title: { default: …, template: `%s - ${gameName} | ${SITE_NAME} (${nativeName})` },
      type: "website", siteName: SITE_NAME,
      locale: LANG_HREFLANG[lang],
      images: [{ url: DEFAULT_OG_IMAGE, width: 3000, height: 3000 }],
    },
    // REMOVED: the hand-rolled `languages` map (§3.7 — invalid hreflang="canonical")
    // REMOVED: `alternates.canonical: /${lang}` (§3.8 — leaks to children)
  };
}
```

#### Tier 3 — the 21 section layouts (`app/guides/layout.tsx`, `app/cards/browse/layout.tsx`, …)

These are page metadata living in a layout (§2.8), each a full duplicate block. They become
helper calls like any page — they are just where the index route's metadata happens to live:

```ts
// app/guides/layout.tsx — English tree, so no lang argument
export const metadata = buildPageMetadata({ path: "/guides", title: "Guides", description: … });
```

**Two gotchas specific to this tier:**
1. Their `title` currently contains the full suffix (`"Guides - Strategy & Tips - Slay the Spire 2
   (sts2) | Spire Codex"`). Under tier 1's template that would **double-suffix** — each must be
   cut down to its segment (`"Guides"`).
2. A layout's `title` is also the *default for its children*, so cutting it down is what makes
   `/guides` and `/guides/[slug]` finally share one structure.

#### ⚠️ The one thing to verify before committing to this (you said you'd test it)

Template propagation is gated by `resolve-metadata.js:800`:

```js
// If the layout is the same layer with page, skip the leaf layout and leaf page
// The leaf layout and page are the last two items
if (i < metadataItems.length - 2) { titleTemplates = { … } }
```

`metadataItems` is one entry per tree segment (`:434`), so **whether a given layout's template
reaches the page depends on how many segments sit below it.** Reading the source, tier 1 always
propagates, and tier 2 should propagate for `/{lang}/cards/{id}` (4 segments) — but for a shallow
route like `/{lang}/cards` it lands close enough to the `length - 2` cutoff that I would not
assert it without seeing rendered output. If tier 2's template is suppressed there, those pages
would silently fall back to the **English** root template — visible immediately as an
un-localized suffix.

**Test that settles it** (`npm run dev`, no build needed):

```bash
curl -s localhost:3000/cards      | grep -o '<title>[^<]*'   # tier 1 template
curl -s localhost:3000/esp/cards  | grep -o '<title>[^<]*'   # tier 2, SHALLOW  ← the risky one
curl -s localhost:3000/esp/cards/strike | grep -o '<title>[^<]*'  # tier 2, deep
curl -s localhost:3000/esp/cards  | grep -o 'og:title[^>]*'  # og channel, separately templated
```

Expect the Spanish suffix on both `/esp/…` titles. English suffix on `/esp/cards` = the guard bit;
suffix appearing twice = a missing `title.default`.

### 4.8 Deliberately left out — handled by overriding the output

Each of these has a long tail rather than a common shape, so they stay at the call site:

| Concern | Real usage | Why not a parameter |
|---|---|---|
| `openGraph.images` | `DEFAULT_OG_IMAGE` in **126** files; the entire tail is **7**: `HOME_OG_IMAGE` (2), `cardOgImages` (2), `firstNewsImage` (3) | 95% take the default; a param would exist to serve 7 files |
| Canonical *path* override | 1 route — `[lang]/runs/[hash]` collapses co-op siblings onto `primary_hash` | Genuinely singular |
| Off-site canonical | 1 route — `[lang]/news/[...slug]` canonicals to `canonicalSteamUrl(gid)` | Contradicts all 3 strategies; must be an override |
| `publishedTime` / `authors` | news article routes only | Not common |
| Bypassing the title template | 1 route — `[lang]/news/[...slug]`'s different shape | Next already has `title: { absolute }` for this |

Override shape — explicit, and safe as long as the nested object is spread:

```ts
const meta = buildPageMetadata({ lang, path: `/cards/${id}`, title, description, ogType: "article" });
return { ...meta, openGraph: { ...meta.openGraph, images: cardOgImages(card, lang) } };
```

The nested spread is the one sharp edge: `openGraph: { images }` alone would silently drop
`locale`, `siteName` and `url`. If that proves error-prone in review, the cheap fix is a tiny
`withOpenGraph(meta, { images })` merge helper rather than promoting `images` to a parameter.

**Companion worth adding at the same time** — `localizedPath(lang, path)`, exported from
`lib/seo.ts` and used both internally by the above *and* by JSON-LD call sites, so 3.4 collapses
to a single prefixing implementation instead of the hand-rolled one in
`[lang]/archetypes/page.tsx`.

### What this does and doesn't buy

Structurally prevents: **2.1, 2.2, 2.3, 2.4, 2.5, 3.4**, and with §4.2's templates the whole of
**2.7** rather than only its structural half — each becomes unrepresentable rather than merely
discouraged, which is the actual anti-drift property. The title/description triplication behind
much of 2.3 is deleted outright rather than centralized.

Does **not** fix: the missing routes in 3.2, the hreflang bug in 3.1 (inherited unchanged, since
the helper still delegates to `buildLanguageAlternates` — fixing it there fixes it everywhere),
and everything tagged **[i18n]**, which belongs to the next-intl migration.

### Open design questions for whoever implements

1. **Static `metadata` exports (39 files)** must become `generateMetadata` to see the locale —
   mechanical, but 39 more files in the blast radius. Could be deferred: they are mostly canonical
   English routes where the static object is still correct.
2. **Should `path` be validated against the localized-route registry** (3.5), so `canonical:
   "locale"` on a route with no `[lang]` page fails loudly instead of advertising a 404 (3.2)?
   Fixes a whole bug class, but couples the helper to a route manifest. Note next-intl's routing
   config would become the natural home for that manifest — so this may be worth *deferring* to
   the migration rather than building a manifest now that gets replaced.
3. **Title builders.** Two dominant shapes exist (index vs `[id]` detail). Wrapping them would cut
   2.7 further — but the wording inputs are `t()`/`LANG_*` lookups today and next-intl message
   keys tomorrow, so this is better done *as part of* the migration than ahead of it.

---

## 5. Verification (for the eventual implementation, not this report)

- `npx tsc --noEmit -p .` and `npx eslint <changed>` — both currently pass.
  **Do not run `next build`**: it OOM-killed the machine twice this session (exit 137).
- Land unit tests alongside the helper (§3.6 — there are none today): assert canonical is
  `prefix + path` with and without a `lang`, that `noindex` suppresses `languages` but keeps
  `canonical`, that `openGraph.locale` is always set, and pin the `en` self-reference so 3.1
  can't regress once fixed.
- **Template behaviour needs rendered-output checks, not unit tests** — the inheritance in §4.2
  happens inside Next's resolver, so a unit test on the helper's return value cannot see it.
  Via `npm run dev` + `curl`, confirm `<title>`, `og:title` and `twitter:title` each carry the
  suffix exactly once on: `/relics` and `/esp/relics` (both trees), `/esp/cards` (the shallow
  case in §4.7), `/deck-lab` (noindex), and `/news/<slug>` (the `absolute` escape hatch).
  Double-suffixing is the expected failure mode if a `default` is missed (§4.2 caveat).
