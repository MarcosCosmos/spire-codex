import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

/** Shared with app/[lang]/guides/submit/layout.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  return buildPageMetadata({
    lang,
    path: "/guides/submit",
    title: t("Submit a Guide", getLangOrDefault(lang)),
    description: "Submit a community strategy guide for Slay the Spire 2 (sts2). Share character guides, boss strategies, and deck-building tips with the Spire Codex community.",
  });
}

export default function GuideSubmitLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
