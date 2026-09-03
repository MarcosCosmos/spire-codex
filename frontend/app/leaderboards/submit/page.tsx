import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import SubmitRunClient from "./SubmitRunClient";

export const dynamic = "force-dynamic";

/** Shared with app/[lang]/leaderboards/submit/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  if (lang && !isValidLang(lang)) return {};
  return buildPageMetadata({
    lang,
    path: "/leaderboards/submit",
    title: t("Submit a Run", lang ?? "eng"),
    description: t("submit_tagline", lang ?? "eng"),
  });
}

export default function SubmitRunPage() {
  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Leaderboards", href: "/leaderboards" },
    { name: "Submit a Run", href: "/leaderboards/submit" },
  ]);
  return (
    <>
      <JsonLd data={jsonLd} />
      <SubmitRunClient />
    </>
  );
}
