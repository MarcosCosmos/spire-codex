import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import SubmitRunClient from "./SubmitRunClient";

export const dynamic = "force-dynamic";

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

/** Shared with app/[lang]/leaderboards/submit/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  return buildPageMetadata({
    lang,
    path: "/leaderboards/submit",
    title: t("Submit a Run", getLangOrDefault(lang)),
    description: t("submit_tagline", getLangOrDefault(lang)),
  });
}

export default async function SubmitRunPage({
  params,
}: {
  params?: Promise<{ lang?: string }>;
} = {}) {
  const _lang = (await params)?.lang;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const jsonLd = buildBreadcrumbJsonLd([
    { name: t("Home", lang), href: prefix || "/" },
    { name: t("Leaderboards", lang), href: `${prefix}/leaderboards` },
    { name: t("Submit a Run", lang), href: `${prefix}/leaderboards/submit` },
  ]);
  return (
    <>
      <JsonLd data={jsonLd} />
      <SubmitRunClient />
    </>
  );
}
