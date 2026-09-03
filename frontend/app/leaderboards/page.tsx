import { Suspense } from "react";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import LeaderboardBrowseClient from "./LeaderboardBrowseClient";

export const dynamic = "force-dynamic";

/** Shared with app/[lang]/leaderboards/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  if (lang && !isValidLang(lang)) return {};
  return buildPageMetadata({
    lang,
    path: "/leaderboards",
    title: t("Leaderboards", lang ?? "eng"),
    description: t("leaderboards_tagline", lang ?? "eng"),
  });
}

export default function ToolsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Leaderboards",
      description:
        "Community-submitted runs across every character and ascension. Filter by character, ascension, and outcome.",
      path: "/leaderboards",
    }),
  ];

  // LeaderboardBrowseClient calls `useSearchParams()`, which opts the
  // whole tree out of static prerender and was preventing the JSON-LD
  // sibling from making it into the SSR HTML, GSC saw zero
  // structured data on /leaderboards. Wrapping the client component
  // in <Suspense> isolates the bailout so the JsonLd ships in the
  // initial server response.
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense>
        <LeaderboardBrowseClient />
      </Suspense>
    </>
  );
}
