import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";

/** Shared with app/[lang]/about/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  if (lang && !isValidLang(lang)) return {};
  return buildPageMetadata({
    lang,
    path: "/about",
    title: t("About", lang ?? "eng"),
    description: t("about_tagline", lang ?? "eng"),
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  // /about is a `"use client"` page so JSON-LD has to land in the
  // server layout. We model it as an Article describing the site
  // itself, gives Google the breadcrumb + headline pair it needs to
  // index this page properly.
  const jsonLd = buildDetailPageJsonLd({
    name: "About Spire Codex",
    description:
      "About Spire Codex, a community-built database for Slay the Spire 2. The data pipeline, tech stack, and credits behind the site.",
    path: "/about",
    category: "Site",
    breadcrumbs: [
      { name: "Home", href: "/" },
      { name: "About", href: "/about" },
    ],
  });
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
